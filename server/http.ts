import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { ErrorCode } from "../shared/protocol.ts";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type Params = Record<string, string>;

export type Handler = (req: IncomingMessage, res: ServerResponse, params: Params, url: URL) => Promise<void> | void;

type Route = {
  method: string;
  pattern: string[];
  handler: Handler;
};

export class Router {
  private readonly routes: Route[] = [];

  on(method: string, path: string, handler: Handler): this {
    this.routes.push({ method, pattern: path.split("/").filter(Boolean), handler });
    return this;
  }

  match(method: string, pathname: string): { handler: Handler; params: Params } | null {
    const parts = pathname.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method || route.pattern.length !== parts.length) {
        continue;
      }
      const params: Params = {};
      const matches = route.pattern.every((segment, index) => {
        if (segment.startsWith(":")) {
          params[segment.slice(1)] = decodeURIComponent(parts[index]);
          return true;
        }
        return segment === parts[index];
      });
      if (matches) {
        return { handler: route.handler, params };
      }
    }
    return null;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const matched = this.match(req.method ?? "GET", url.pathname);
    if (!matched) {
      return false;
    }
    try {
      await matched.handler(req, res, matched.params, url);
    } catch (error) {
      sendError(res, error);
    }
    return true;
  }
}

export function sendError(res: ServerResponse, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const code: ErrorCode = error instanceof HttpError ? error.code : "agent_error";
  const message = error instanceof Error ? error.message : String(error);
  if (status >= 500) {
    process.stderr.write(`${message}\n`);
  }
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, status, { code, message });
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "bad_request", "The body is not valid JSON");
  }
}

export function sendJson(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

export function requireBearer(req: IncomingMessage, token: string) {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(req.headers.authorization ?? "");
  if (token === "" || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HttpError(401, "unauthorized", "Missing or wrong bearer token");
  }
}

export function openEventStream(res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

export function writeEvent(res: ServerResponse, id: number, data: unknown) {
  res.write(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function* readEventStream(
  body: AsyncIterable<Uint8Array> | null | undefined,
): AsyncGenerator<{ id: string | null; data: string }> {
  if (!body) {
    return;
  }
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of body) {
    buffered += decoder.decode(chunk, { stream: true });
    let boundary = buffered.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffered.slice(0, boundary);
      buffered = buffered.slice(boundary + 2);
      let id: string | null = null;
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("id:")) {
          id = line.slice(3).trim();
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (data.length > 0) {
        yield { id, data: data.join("\n") };
      }
      boundary = buffered.indexOf("\n\n");
    }
  }
}
