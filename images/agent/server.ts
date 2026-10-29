import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer, request as httpRequest } from "node:http";
import { join } from "node:path";

import type { FileEntry, JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";

import type {
  AgentConversation,
  AgentConversationState,
  AgentRecord,
  ErrorCode,
  OpenConversationRequest,
  PromptRequest,
} from "../../shared/protocol.ts";

const PORT = 8080;
const IS_AGENTCORE = process.env.AGENT_MODE === "agentcore";
const DATA_DIR = IS_AGENTCORE ? "/mnt/data" : "/data";
const PROJECT_DIR = join(DATA_DIR, "project");
const CONFIG_FILE = join(DATA_DIR, "config.json");
const SESSION_DIR = "/tmp/conversations";
const TOKEN = process.env.AGENT_TOKEN ?? "";
const LOOPBACK_TOKEN = randomBytes(24).toString("base64url");
const PROVIDER_KEY_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GEMINI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};
const IDLE_MS = 30 * 60 * 1000;
const TAIL_INTERVAL_MS = 250;
const COMMAND_TIMEOUT_MS = 30 * 1000;
const RECORD_LIMIT = 20000;

type Listener = (record: AgentRecord) => void;

type Pending = {
  resolve: (response: RpcResponseLine) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type RpcResponseLine = {
  type: "response";
  id?: string;
  command: string;
  success: boolean;
  error?: string;
  data?: unknown;
};

type Conversation = {
  id: string;
  file: string;
  child: ChildProcessWithoutNullStreams;
  state: AgentConversationState;
  seq: number;
  records: AgentRecord[];
  listeners: Set<Listener>;
  pending: Map<string, Pending>;
  stdoutBuffer: string;
  tailOffset: number;
  tailRemainder: string;
  lastLine: string;
  tailTimer: NodeJS.Timeout;
  idleSince: number;
  closed: boolean;
};

const conversations = new Map<string, Conversation>();
let commandCounter = 0;

class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let config: Record<string, string> = {};

function setting(name: string): string | undefined {
  return config[name] ?? process.env[name];
}

function piEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(config)) {
    if (key !== "PI_API_KEY" && key !== "AGENT_TOKEN") {
      env[key] = value;
    }
  }
  const provider = setting("PI_PROVIDER");
  const apiKey = config.PI_API_KEY;
  if (provider && apiKey && PROVIDER_KEY_VARS[provider]) {
    env[PROVIDER_KEY_VARS[provider]] = apiKey;
  }
  delete env.AGENT_TOKEN;
  delete env.PI_API_KEY;
  return env;
}

function piArgs(file: string): string[] {
  const args = ["--mode", "rpc", "--session", file];
  const provider = setting("PI_PROVIDER");
  const model = setting("PI_MODEL");
  if (provider) {
    args.push("--provider", provider);
  }
  if (model) {
    args.push("--model", model);
  }
  return args;
}

function agentsMd(mbUrl: string, publicUrl: string): string {
  return [
    "# This environment",
    "",
    `You work on one Metabase through the \`mb\` CLI, which is already logged in (as an admin, with an API key) at ${mbUrl}.`,
    "Load the `metabase-cli` skill before using it.",
    "",
    `People open this Metabase in their browser at ${publicUrl}. When you link to anything in it (a dashboard, a`,
    `question, a collection), build the link with that base URL, never with ${mbUrl}.`,
    "",
  ].join("\n");
}

function mbLogin(url: string, apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("mb", ["auth", "login", "--url", url], { env: piEnv(), stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`mb auth login failed: ${stderr.trim()}`))));
    child.stdin.end(apiKey);
  });
}

async function applyConfig(next: Record<string, string>) {
  const mbUrl = next.MB_URL;
  const apiKey = next.MB_API_KEY;
  if (!mbUrl || !apiKey) {
    throw new HttpError(400, "bad_request", "MB_URL and MB_API_KEY are required");
  }
  config = next;
  mkdirSync(PROJECT_DIR, { recursive: true });
  writeFileSync(join(PROJECT_DIR, "AGENTS.md"), agentsMd(mbUrl, next.MB_PUBLIC_URL ?? mbUrl));
  await mbLogin(mbUrl, apiKey);
}

async function loadSavedConfig() {
  if (IS_AGENTCORE && Object.keys(config).length === 0 && existsSync(CONFIG_FILE)) {
    await applyConfig(JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Record<string, string>);
  }
}

type RecordInput = { kind: "event"; event: JsonAgentSessionEvent } | { kind: "entry"; entry: FileEntry };

function emit(conversation: Conversation, record: RecordInput) {
  conversation.seq += 1;
  const full = { ...record, seq: conversation.seq } as AgentRecord;
  conversation.records.push(full);
  if (conversation.records.length > RECORD_LIMIT) {
    conversation.records.splice(0, conversation.records.length - RECORD_LIMIT);
  }
  for (const listener of conversation.listeners) {
    listener(full);
  }
}

function handleStdoutLine(conversation: Conversation, line: string) {
  const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (trimmed === "") {
    return;
  }
  let record: { type?: string; id?: string };
  try {
    record = JSON.parse(trimmed);
  } catch {
    process.stderr.write(`[${conversation.id}] unparsable pi output\n`);
    return;
  }
  if (record.type === "response") {
    const response = record as RpcResponseLine;
    const pending = response.id ? conversation.pending.get(response.id) : undefined;
    if (pending && response.id) {
      clearTimeout(pending.timer);
      conversation.pending.delete(response.id);
      pending.resolve(response);
    }
    return;
  }
  if (record.type === "extension_ui_request" || record.type === "extension_error") {
    return;
  }
  const event = record as JsonAgentSessionEvent;
  readTail(conversation);
  if (event.type === "agent_start") {
    conversation.state = "running";
  } else if (event.type === "agent_settled") {
    conversation.state = "idle";
    conversation.idleSince = Date.now();
  }
  emit(conversation, { kind: "event", event });
}

function readTail(conversation: Conversation) {
  let size: number;
  try {
    size = statSync(conversation.file).size;
  } catch {
    return;
  }
  if (size === conversation.tailOffset) {
    return;
  }
  if (size < conversation.tailOffset || !lastLineStillThere(conversation)) {
    conversation.tailOffset = 0;
    conversation.tailRemainder = "";
    conversation.lastLine = "";
  }
  const length = size - conversation.tailOffset;
  const buffer = Buffer.alloc(length);
  const fd = openSync(conversation.file, "r");
  try {
    readSync(fd, buffer, 0, length, conversation.tailOffset);
  } finally {
    closeSync(fd);
  }
  conversation.tailOffset = size;
  const text = conversation.tailRemainder + buffer.toString("utf8");
  const lines = text.split("\n");
  conversation.tailRemainder = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }
    conversation.lastLine = line;
    try {
      emit(conversation, { kind: "entry", entry: JSON.parse(line) as FileEntry });
    } catch {
      process.stderr.write(`[${conversation.id}] unparsable session line\n`);
    }
  }
}

function lastLineStillThere(conversation: Conversation): boolean {
  if (conversation.lastLine === "") {
    return true;
  }
  const expected = Buffer.from(`${conversation.lastLine}\n`, "utf8");
  const start = conversation.tailOffset - Buffer.byteLength(conversation.tailRemainder, "utf8") - expected.length;
  if (start < 0) {
    return false;
  }
  const actual = Buffer.alloc(expected.length);
  const fd = openSync(conversation.file, "r");
  try {
    readSync(fd, actual, 0, expected.length, start);
  } finally {
    closeSync(fd);
  }
  return actual.equals(expected);
}

function writeSession(file: string, entries: FileEntry[]): number {
  const content = entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
  writeFileSync(file, content);
  return Buffer.byteLength(content, "utf8");
}

function startConversation(id: string, entries: FileEntry[]): Conversation {
  const dir = join(SESSION_DIR, id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(PROJECT_DIR, { recursive: true });
  const file = join(dir, "session.jsonl");
  const written = writeSession(file, entries);
  const child = spawn("pi", piArgs(file), { cwd: PROJECT_DIR, env: piEnv() });
  const conversation: Conversation = {
    id,
    file,
    child,
    state: "idle",
    seq: 0,
    records: [],
    listeners: new Set(),
    pending: new Map(),
    stdoutBuffer: "",
    tailOffset: written,
    tailRemainder: "",
    lastLine: entries.length > 0 ? JSON.stringify(entries[entries.length - 1]) : "",
    tailTimer: setInterval(() => readTail(conversation), TAIL_INTERVAL_MS),
    idleSince: Date.now(),
    closed: false,
  };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    conversation.stdoutBuffer += chunk;
    const lines = conversation.stdoutBuffer.split("\n");
    conversation.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      handleStdoutLine(conversation, line);
    }
  });
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(`[${id}] ${chunk.toString("utf8")}`));
  child.on("exit", (code, signal) => {
    if (!conversation.closed) {
      process.stderr.write(`[${id}] pi exited (${code ?? signal})\n`);
      closeConversation(conversation, false);
    }
  });
  conversations.set(id, conversation);
  return conversation;
}

function closeConversation(conversation: Conversation, removeFiles: boolean) {
  if (conversation.closed) {
    return;
  }
  readTail(conversation);
  conversation.closed = true;
  clearInterval(conversation.tailTimer);
  for (const pending of conversation.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("The conversation was closed"));
  }
  conversation.pending.clear();
  if (conversation.state === "running") {
    conversation.state = "idle";
    emit(conversation, { kind: "event", event: { type: "agent_settled", aborted: true } as JsonAgentSessionEvent });
  }
  conversation.listeners.clear();
  conversation.child.kill("SIGTERM");
  conversations.delete(conversation.id);
  if (removeFiles) {
    rmSync(join(SESSION_DIR, conversation.id), { recursive: true, force: true });
  }
}

function sendCommand(conversation: Conversation, command: Record<string, unknown>): Promise<RpcResponseLine> {
  commandCounter += 1;
  const id = `cmd-${commandCounter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conversation.pending.delete(id);
      reject(new Error(`pi did not answer ${String(command.type)} in time`));
    }, COMMAND_TIMEOUT_MS);
    conversation.pending.set(id, { resolve, reject, timer });
    conversation.child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
  });
}

function toJson(conversation: Conversation): AgentConversation {
  return { id: conversation.id, state: conversation.state, seq: conversation.seq };
}

function getConversation(id: string): Conversation {
  const conversation = conversations.get(id);
  if (!conversation) {
    throw new HttpError(404, "not_found", `Conversation ${id} is not open`);
  }
  return conversation;
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "bad_request", "The body is not valid JSON");
  }
}

function sendJson(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function matchesBearer(req: IncomingMessage, token: string): boolean {
  if (token === "") {
    return false;
  }
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(req.headers.authorization ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isAuthorized(req: IncomingMessage): boolean {
  return matchesBearer(req, TOKEN) || matchesBearer(req, LOOPBACK_TOKEN);
}

type Invocation = {
  method?: string;
  path?: string;
  body?: unknown;
};

async function invoke(req: IncomingMessage, res: ServerResponse) {
  const invocation = await readJson<Invocation>(req);
  const path = typeof invocation.path === "string" && invocation.path.startsWith("/") ? invocation.path : null;
  if (!path || path.startsWith("/invocations")) {
    throw new HttpError(400, "bad_request", "An invocation needs a path");
  }
  const body = invocation.body === undefined ? undefined : JSON.stringify(invocation.body);
  const upstream = httpRequest({
    host: "127.0.0.1",
    port: PORT,
    path,
    method: invocation.method ?? "GET",
    headers: {
      Authorization: `Bearer ${LOOPBACK_TOKEN}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }),
    },
  });
  upstream.on("response", (response) => {
    if ((response.headers["content-type"] ?? "").includes("text/event-stream")) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      response.pipe(res);
      req.on("close", () => response.destroy());
      return;
    }
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      let parsed: unknown = null;
      try {
        parsed = text === "" ? null : JSON.parse(text);
      } catch {
        parsed = text;
      }
      sendJson(res, 200, { status: response.statusCode ?? 500, body: parsed });
    });
  });
  upstream.on("error", (error) => sendJson(res, 200, { status: 502, body: { code: "agent_error", message: error.message } }));
  upstream.end(body);
}

function streamEvents(req: IncomingMessage, res: ServerResponse, conversation: Conversation, after: number) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const write = (record: AgentRecord) => res.write(`id: ${record.seq}\ndata: ${JSON.stringify(record)}\n\n`);
  for (const record of conversation.records) {
    if (record.seq > after) {
      write(record);
    }
  }
  conversation.listeners.add(write);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
  const stop = () => {
    clearInterval(heartbeat);
    conversation.listeners.delete(write);
    conversation.idleSince = Date.now();
  };
  req.on("close", stop);
  const closeWatcher = setInterval(() => {
    if (conversation.closed) {
      clearInterval(closeWatcher);
      stop();
      res.end();
    }
  }, 1000);
  req.on("close", () => clearInterval(closeWatcher));
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://agent");
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/ping") {
    const busy = [...conversations.values()].some((conversation) => conversation.state === "running");
    sendJson(res, 200, { status: busy ? "HealthyBusy" : "Healthy" });
    return;
  }
  if (IS_AGENTCORE && method === "POST" && url.pathname === "/invocations") {
    await invoke(req, res);
    return;
  }
  if (!isAuthorized(req)) {
    throw new HttpError(401, "unauthorized", "Missing or wrong bearer token");
  }
  if (IS_AGENTCORE && method === "PUT" && url.pathname === "/configure") {
    const body = await readJson<{ env?: Record<string, string> }>(req);
    const next = Object.fromEntries(Object.entries(body.env ?? {}).map(([key, value]) => [key, String(value)]));
    await applyConfig(next);
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(next), { mode: 0o600 });
    sendJson(res, 204);
    return;
  }
  await loadSavedConfig();
  if (parts[0] !== "conversations") {
    throw new HttpError(404, "not_found", "No such route");
  }

  if (parts.length === 1) {
    if (method === "GET") {
      sendJson(res, 200, { data: [...conversations.values()].map(toJson) });
      return;
    }
    if (method === "POST") {
      const body = await readJson<OpenConversationRequest>(req);
      const id = `cv_${randomBytes(6).toString("hex")}`;
      sendJson(res, 201, toJson(startConversation(id, body.entries ?? [])));
      return;
    }
  }

  const conversation = getConversation(parts[1]);

  if (parts.length === 2) {
    if (method === "GET") {
      sendJson(res, 200, toJson(conversation));
      return;
    }
    if (method === "PUT") {
      if (conversation.state === "running") {
        throw new HttpError(409, "conversation_running", "The conversation is running");
      }
      const body = await readJson<OpenConversationRequest>(req);
      closeConversation(conversation, true);
      sendJson(res, 200, toJson(startConversation(conversation.id, body.entries ?? [])));
      return;
    }
    if (method === "DELETE") {
      closeConversation(conversation, true);
      sendJson(res, 204);
      return;
    }
  }

  if (parts.length === 3 && method === "POST" && parts[2] === "prompt") {
    if (conversation.state === "running") {
      throw new HttpError(409, "conversation_running", "The conversation is running");
    }
    const body = await readJson<PromptRequest>(req);
    if (typeof body.message !== "string" || body.message.trim() === "") {
      throw new HttpError(400, "bad_request", "A message is required");
    }
    const response = await sendCommand(conversation, { type: "prompt", message: body.message });
    if (!response.success) {
      throw new HttpError(502, "agent_error", response.error ?? "pi rejected the prompt");
    }
    conversation.state = "running";
    sendJson(res, 202, toJson(conversation));
    return;
  }

  if (parts.length === 3 && method === "POST" && parts[2] === "abort") {
    await sendCommand(conversation, { type: "abort" });
    sendJson(res, 202, toJson(conversation));
    return;
  }

  if (parts.length === 3 && method === "GET" && parts[2] === "events") {
    const after = Number(url.searchParams.get("after") ?? "0");
    streamEvents(req, res, conversation, Number.isFinite(after) ? after : 0);
    return;
  }

  throw new HttpError(404, "not_found", "No such route");
}

const server = createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : "agent_error";
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      sendJson(res, status, { code, message });
    } else {
      res.end();
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const conversation of conversations.values()) {
    if (conversation.state === "idle" && conversation.listeners.size === 0 && now - conversation.idleSince > IDLE_MS) {
      closeConversation(conversation, true);
    }
  }
}, 60 * 1000);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    for (const conversation of [...conversations.values()]) {
      closeConversation(conversation, false);
    }
    server.close(() => process.exit(0));
  });
}

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`agent server listening on ${PORT}\n`);
});
