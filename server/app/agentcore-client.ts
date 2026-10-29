import type { FileEntry } from "../../shared/conversation.ts";
import type { AgentConversation, AgentRecord, ErrorBody } from "../../shared/protocol.ts";
import { readEventStream } from "../http.ts";

import type { Agent } from "./clients.ts";
import { UpstreamError } from "./errors.ts";

type Envelope = { status: number; body: unknown };

type SdkStream = AsyncIterable<Uint8Array> & { transformToString(): Promise<string> };

export class AgentCoreAgentClient implements Agent {
  private readonly runtimeArn: string;
  private readonly sessionId: string;

  constructor(runtimeArn: string, sessionId: string) {
    this.runtimeArn = runtimeArn;
    this.sessionId = sessionId;
  }

  private async invoke(method: string, path: string, body: unknown, accept: string, signal?: AbortSignal) {
    const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = await import("@aws-sdk/client-bedrock-agentcore");
    const client = new BedrockAgentCoreClient({});
    try {
      const output = await client.send(
        new InvokeAgentRuntimeCommand({
          agentRuntimeArn: this.runtimeArn,
          runtimeSessionId: this.sessionId,
          contentType: "application/json",
          accept,
          payload: new TextEncoder().encode(JSON.stringify({ method, path, body })),
        }),
        { abortSignal: signal },
      );
      return { stream: output.response as SdkStream | undefined, contentType: output.contentType ?? "" };
    } catch (error) {
      if (signal?.aborted) {
        return { stream: undefined, contentType: "" };
      }
      throw new UpstreamError(502, `InvokeAgentRuntime failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { stream } = await this.invoke(method, path, body, "application/json");
    const envelope = JSON.parse((await stream?.transformToString()) ?? "null") as Envelope | null;
    if (!envelope) {
      throw new UpstreamError(502, "The agent returned an empty invocation response");
    }
    if (envelope.status >= 400) {
      const message = (envelope.body as ErrorBody | null)?.message ?? `${method} ${path} failed with ${envelope.status}`;
      throw new UpstreamError(envelope.status, message);
    }
    return envelope.body as T;
  }

  open(entries: FileEntry[]) {
    return this.call<AgentConversation>("POST", "/conversations", { entries });
  }

  get(id: string) {
    return this.call<AgentConversation>("GET", `/conversations/${id}`);
  }

  async close(id: string) {
    await this.call<void>("DELETE", `/conversations/${id}`);
  }

  prompt(id: string, message: string) {
    return this.call<AgentConversation>("POST", `/conversations/${id}/prompt`, { message });
  }

  abort(id: string) {
    return this.call<AgentConversation>("POST", `/conversations/${id}/abort`);
  }

  async *events(id: string, after: number, signal: AbortSignal): AsyncGenerator<AgentRecord> {
    const { stream, contentType } = await this.invoke(
      "GET",
      `/conversations/${id}/events?after=${after}`,
      undefined,
      "text/event-stream",
      signal,
    );
    if (stream && !contentType.includes("text/event-stream")) {
      const envelope = JSON.parse(await stream.transformToString()) as Envelope;
      throw new UpstreamError(envelope.status, (envelope.body as ErrorBody | null)?.message ?? "The agent refused the stream");
    }
    try {
      for await (const { data } of readEventStream(stream)) {
        yield JSON.parse(data) as AgentRecord;
      }
    } catch (error) {
      if (!signal.aborted) {
        throw error;
      }
    }
  }
}
