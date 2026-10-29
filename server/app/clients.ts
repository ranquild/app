import type { FileEntry } from "../../shared/conversation.ts";
import type {
  AgentConversation,
  AgentRecord,
  EnvironmentSpec,
  ErrorBody,
  ProvisionedEnvironment,
} from "../../shared/protocol.ts";
import { HttpError, readEventStream } from "../http.ts";

export class UpstreamError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseErrorMessage(text: string): string {
  try {
    return (JSON.parse(text) as ErrorBody).message ?? text;
  } catch {
    return text;
  }
}

async function request<T>(baseUrl: string, token: string, method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new UpstreamError(502, `Can't reach ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const text = await response.text();
    const message = parseErrorMessage(text);
    throw new UpstreamError(response.status, message || `${method} ${path} failed with ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  return (contentType.includes("application/json") ? await response.json() : await response.text()) as T;
}

export class ProvisionerClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  create(spec: EnvironmentSpec) {
    return request<ProvisionedEnvironment>(this.baseUrl, this.token, "POST", "/environments", spec);
  }

  get(id: string) {
    return request<ProvisionedEnvironment>(this.baseUrl, this.token, "GET", `/environments/${id}`);
  }

  replace(id: string, spec: EnvironmentSpec) {
    return request<ProvisionedEnvironment>(this.baseUrl, this.token, "PUT", `/environments/${id}`, spec);
  }

  start(id: string) {
    return request<ProvisionedEnvironment>(this.baseUrl, this.token, "POST", `/environments/${id}/start`);
  }

  stop(id: string) {
    return request<ProvisionedEnvironment>(this.baseUrl, this.token, "POST", `/environments/${id}/stop`);
  }

  delete(id: string) {
    return request<void>(this.baseUrl, this.token, "DELETE", `/environments/${id}`);
  }

  logs(id: string, service: string | null, tail: number) {
    const query = new URLSearchParams({ tail: String(tail), ...(service ? { service } : {}) });
    return request<string>(this.baseUrl, this.token, "GET", `/environments/${id}/logs?${query}`);
  }
}

export class AgentClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  open(entries: FileEntry[]) {
    return request<AgentConversation>(this.baseUrl, this.token, "POST", "/conversations", { entries });
  }

  get(id: string) {
    return request<AgentConversation>(this.baseUrl, this.token, "GET", `/conversations/${id}`);
  }

  close(id: string) {
    return request<void>(this.baseUrl, this.token, "DELETE", `/conversations/${id}`);
  }

  prompt(id: string, message: string) {
    return request<AgentConversation>(this.baseUrl, this.token, "POST", `/conversations/${id}/prompt`, { message });
  }

  abort(id: string) {
    return request<AgentConversation>(this.baseUrl, this.token, "POST", `/conversations/${id}/abort`);
  }

  async *events(id: string, after: number, signal: AbortSignal): AsyncGenerator<AgentRecord> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/conversations/${id}/events?after=${after}`, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "text/event-stream" },
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      throw new UpstreamError(502, `Can't reach the agent: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      throw new UpstreamError(response.status, await response.text());
    }
    try {
      for await (const { data } of readEventStream(response)) {
        yield JSON.parse(data) as AgentRecord;
      }
    } catch (error) {
      if (!signal.aborted) {
        throw error;
      }
    }
  }
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof UpstreamError) {
    return new HttpError(error.status === 404 ? 404 : 502, error.status === 404 ? "not_found" : "agent_error", error.message);
  }
  return new HttpError(500, "agent_error", error instanceof Error ? error.message : String(error));
}
