import { existsSync, readFileSync, statSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { homedir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

import { HttpError, Router, openEventStream, readJson, sendError, sendJson } from "../http.ts";

import { ProvisionerClient, toHttpError } from "./clients.ts";
import { Conversations } from "./conversations.ts";
import { type DatabaseRow, type EnvironmentRow, Store } from "./db.ts";
import { Environments } from "./environments.ts";
import type { AiProviderName, AiSettings, LicenseSettings } from "./render.ts";

const PORT = Number(process.env.APP_PORT ?? 3100);
const DATA_DIR = process.env.APP_DATA_DIR ?? join(homedir(), ".app");
const PROVISIONER_URL = process.env.PROVISIONER_URL ?? "http://127.0.0.1:4000";
const PROVISIONER_TOKEN = process.env.PROVISIONER_TOKEN ?? "";
const APP_ORIGINS = (process.env.APP_ORIGINS ?? "http://localhost:3000 http://localhost:3100").split(/\s+/).filter(Boolean);
const STATIC_DIR = resolve(import.meta.dirname, "../../dist");
const ENGINES = JSON.parse(readFileSync(join(import.meta.dirname, "engines.json"), "utf8")) as Record<string, unknown>;
const LICENSE_CHECK_URL = "https://token-check.metabase.com/api";
const MASK = "**********";

const store = new Store(join(DATA_DIR, "app.db"));
const provisioner = new ProvisionerClient(PROVISIONER_URL, PROVISIONER_TOKEN);
const conversations = new Conversations(store);
const environments = new Environments({
  store,
  provisioner,
  appOrigins: APP_ORIGINS,
  onStopped: (id) => conversations.stopEnvironment(id),
});

const AI_PROVIDERS: AiProviderName[] = ["anthropic", "openai", "openrouter", "mistral", "deepseek", "google"];

function mask(secret: string | null | undefined): string | null {
  return secret ? `${MASK}${secret.slice(-4)}` : null;
}

function isMasked(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(MASK);
}

function license() {
  return store.getSetting<LicenseSettings>("license");
}

function ai() {
  return store.getSetting<AiSettings>("ai");
}

function isSetupComplete() {
  return Boolean(license()?.valid && ai());
}

function licenseJson() {
  const current = license();
  return { "valid?": Boolean(current?.valid), plan: current?.plan ?? null, expires_at: current?.expiresAt ?? null };
}

function aiJson() {
  const current = ai();
  return {
    provider: current?.provider ?? null,
    api_key: mask(current?.apiKey),
    default_model: current?.model ?? null,
  };
}

async function checkLicense(token: string): Promise<LicenseSettings> {
  const trimmed = token.trim();
  if (!/^[0-9a-f]{64}$/.test(trimmed)) {
    throw new HttpError(400, "bad_request", "A license token is 64 hexadecimal characters");
  }
  try {
    const response = await fetch(`${LICENSE_CHECK_URL}/${trimmed}/v2/status`);
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok || body.valid === false) {
      throw new HttpError(400, "bad_request", String(body.status ?? "This license token is not valid"));
    }
    return {
      token: trimmed,
      valid: true,
      plan: (body["plan-alias"] as string | undefined) ?? (body.status as string | undefined) ?? null,
      expiresAt: (body["valid-thru"] as string | undefined) ?? null,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    return { token: trimmed, valid: true, plan: null, expiresAt: null };
  }
}

function modelsRequest(provider: AiProviderName, apiKey: string): { url: string; headers: Record<string, string> } {
  const bearer = { Authorization: `Bearer ${apiKey}` };
  switch (provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      };
    case "openai":
      return { url: "https://api.openai.com/v1/models", headers: bearer };
    case "openrouter":
      return { url: "https://openrouter.ai/api/v1/auth/key", headers: bearer };
    case "mistral":
      return { url: "https://api.mistral.ai/v1/models", headers: bearer };
    case "deepseek":
      return { url: "https://api.deepseek.com/models", headers: bearer };
    case "google":
      return { url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, headers: {} };
  }
}

async function testAiProvider(provider: AiProviderName, apiKey: string): Promise<string[]> {
  if (!AI_PROVIDERS.includes(provider)) {
    throw new HttpError(400, "bad_request", `Unknown provider ${provider}`);
  }
  const { url, headers } = modelsRequest(provider, apiKey.trim());
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new HttpError(502, "agent_error", `Can't reach ${provider}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new HttpError(400, "bad_request", `${provider} rejected the API key (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { data?: { id?: string }[]; models?: { name?: string }[] };
  return (body.data?.map((model) => model.id) ?? body.models?.map((model) => model.name) ?? []).filter(
    (id): id is string => typeof id === "string",
  );
}

type AiRequest = { provider?: AiProviderName; api_key?: string; default_model?: string };

async function saveAi(body: AiRequest) {
  const current = ai();
  const provider = body.provider ?? current?.provider;
  if (!provider) {
    throw new HttpError(400, "bad_request", "A provider is required");
  }
  const apiKey = body.api_key && !isMasked(body.api_key) ? body.api_key.trim() : current?.apiKey;
  if (!apiKey) {
    throw new HttpError(400, "bad_request", "An API key is required");
  }
  await testAiProvider(provider, apiKey);
  const model = body.default_model?.trim() || current?.model || "claude-sonnet-5-5";
  store.setSetting("ai", { provider, apiKey, model } satisfies AiSettings);
}

function databaseJson(database: DatabaseRow) {
  const details = { ...database.details };
  if (typeof details.password === "string" && details.password !== "") {
    details.password = mask(details.password);
  }
  return {
    id: database.id,
    name: database.name,
    engine: database.engine,
    details,
    creator_id: null,
    created_at: database.createdAt,
    updated_at: database.updatedAt,
  };
}

type DatabaseRequest = { name?: string; engine?: string; details?: Record<string, unknown> };

function databaseValues(body: DatabaseRequest, current?: DatabaseRow) {
  const name = (body.name ?? current?.name ?? "").trim();
  const engine = (body.engine ?? current?.engine ?? "").trim();
  if (name === "" || engine === "") {
    throw new HttpError(400, "bad_request", "A name and an engine are required");
  }
  if (!(engine in ENGINES)) {
    throw new HttpError(400, "bad_request", `Unknown engine ${engine}`);
  }
  const details = { ...(current?.details ?? {}), ...(body.details ?? {}) };
  if (isMasked(details.password)) {
    details.password = current?.details.password;
  }
  return { name, engine, details };
}

function environmentJson(environment: EnvironmentRow) {
  return {
    id: environment.id,
    name: environment.name,
    status: environment.status,
    metabase_url: environment.status === "running" ? (environment.endpoints?.metabase.url ?? null) : null,
    error_message: environment.errorMessage,
    created_at: environment.createdAt,
    updated_at: environment.updatedAt,
  };
}

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id)) {
    throw new HttpError(404, "not_found", `No such id ${value}`);
  }
  return id;
}

function list<T>(items: T[]) {
  return { data: items, total: items.length };
}

const router = new Router()
  .on("GET", "/api/session/properties", (_req, res) => {
    sendJson(res, 200, {
      "has-user-setup": isSetupComplete(),
      "site-name": "App",
      engines: ENGINES,
      version: { tag: "dev" },
      "has-sample-database?": false,
      "remote-sync-enabled": false,
    });
  })
  .on("GET", "/api/setup", (_req, res) => {
    const current = ai();
    sendJson(res, 200, {
      "token_valid?": true,
      has_user_setup: true,
      "user_exists?": true,
      "license_valid?": Boolean(license()?.valid),
      "git_configured?": true,
      "ai_configured?": Boolean(current),
      "setup_complete?": isSetupComplete(),
      summary: {
        site_name: "App",
        admin_email: null,
        repository_url: null,
        branch: null,
        ai_provider: current?.provider ?? null,
        ai_default_model: current?.model ?? null,
        license_plan: license()?.plan ?? null,
      },
    });
  })
  .on("POST", "/api/setup/license", async (req, res) => {
    const body = await readJson<{ license_token?: string }>(req);
    store.setSetting("license", await checkLicense(body.license_token ?? ""));
    sendJson(res, 200, { status: "ok" });
  })
  .on("POST", "/api/setup/ai-provider", async (req, res) => {
    await saveAi(await readJson<AiRequest>(req));
    sendJson(res, 200, { status: "ok" });
  })
  .on("GET", "/api/license", (_req, res) => sendJson(res, 200, licenseJson()))
  .on("PUT", "/api/license", async (req, res) => {
    const body = await readJson<{ license_token?: string }>(req);
    store.setSetting("license", await checkLicense(body.license_token ?? ""));
    sendJson(res, 200, licenseJson());
  })
  .on("GET", "/api/ai-provider/settings", (_req, res) => sendJson(res, 200, aiJson()))
  .on("PUT", "/api/ai-provider/settings", async (req, res) => {
    await saveAi(await readJson<AiRequest>(req));
    sendJson(res, 200, aiJson());
  })
  .on("POST", "/api/ai-provider/test-connection", async (req, res) => {
    const body = await readJson<AiRequest>(req);
    const apiKey = body.api_key && !isMasked(body.api_key) ? body.api_key : ai()?.apiKey;
    if (!body.provider || !apiKey) {
      throw new HttpError(400, "bad_request", "A provider and an API key are required");
    }
    sendJson(res, 200, { status: "ok", models: await testAiProvider(body.provider, apiKey) });
  })
  .on("GET", "/api/database", (_req, res) => sendJson(res, 200, list(store.listDatabases().map(databaseJson))))
  .on("GET", "/api/database/:id", (_req, res, params) => {
    const database = store.getDatabase(parseId(params.id));
    if (!database) {
      throw new HttpError(404, "not_found", "No such database");
    }
    sendJson(res, 200, databaseJson(database));
  })
  .on("POST", "/api/database", async (req, res) => {
    const { name, engine, details } = databaseValues(await readJson<DatabaseRequest>(req));
    sendJson(res, 200, databaseJson(store.insertDatabase(name, engine, details)));
  })
  .on("PUT", "/api/database/:id", async (req, res, params) => {
    const current = store.getDatabase(parseId(params.id));
    if (!current) {
      throw new HttpError(404, "not_found", "No such database");
    }
    const { name, engine, details } = databaseValues(await readJson<DatabaseRequest>(req), current);
    store.updateDatabase(current.id, name, engine, details);
    sendJson(res, 200, databaseJson(store.getDatabase(current.id) as DatabaseRow));
  })
  .on("DELETE", "/api/database/:id", (_req, res, params) => {
    store.deleteDatabase(parseId(params.id));
    sendJson(res, 204);
  })
  .on("GET", "/api/environment", (_req, res, _params, url) => {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const items = store
      .listEnvironments()
      .filter((environment) => environment.name.toLowerCase().includes(search))
      .map(environmentJson);
    sendJson(res, 200, list(items));
  })
  .on("POST", "/api/environment", async (req, res) => {
    const body = await readJson<{ name?: string }>(req);
    sendJson(res, 200, environmentJson(environments.create(body.name ?? "")));
  })
  .on("GET", "/api/environment/:id", (_req, res, params) => {
    sendJson(res, 200, environmentJson(environments.mustGet(parseId(params.id))));
  })
  .on("DELETE", "/api/environment/:id", (_req, res, params) => {
    environments.delete(parseId(params.id));
    sendJson(res, 204);
  })
  .on("POST", "/api/environment/:id/start", (_req, res, params) => {
    const id = parseId(params.id);
    environments.mustGet(id);
    environments.start(id);
    sendJson(res, 200, environmentJson(environments.mustGet(id)));
  })
  .on("POST", "/api/environment/:id/stop", (_req, res, params) => {
    const id = parseId(params.id);
    environments.stop(id);
    sendJson(res, 200, environmentJson(environments.mustGet(id)));
  })
  .on("GET", "/api/environment/:id/credentials", (_req, res, params) => {
    const { credentials } = environments.mustGet(parseId(params.id));
    sendJson(res, 200, { email: credentials.email, password: credentials.password });
  })
  .on("POST", "/api/environment/:id/metabase-session", async (_req, res, params) => {
    const environment = environments.mustGet(parseId(params.id));
    if (environment.status !== "running" || !environment.endpoints) {
      throw new HttpError(409, "conversation_running", "Start the environment first");
    }
    const { email, password } = environment.credentials;
    let response: Response;
    try {
      response = await fetch(`${environment.endpoints.metabase.url}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password, remember: true }),
      });
    } catch (error) {
      throw new HttpError(502, "agent_error", `Can't reach Metabase: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      throw new HttpError(502, "agent_error", `Metabase refused the login (HTTP ${response.status})`);
    }
    const { id } = (await response.json()) as { id: string };
    res.writeHead(204, {
      "Set-Cookie": `metabase.SESSION=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600`,
    });
    res.end();
  })
  .on("GET", "/api/environment/:id/logs", async (_req, res, params, url) => {
    const environment = environments.mustGet(parseId(params.id));
    if (!environment.provisionerId) {
      sendJson(res, 200, { logs: "" });
      return;
    }
    const tail = Number(url.searchParams.get("tail") ?? 200);
    try {
      const logs = await provisioner.logs(environment.provisionerId, url.searchParams.get("service"), tail);
      sendJson(res, 200, { logs });
    } catch (error) {
      throw toHttpError(error);
    }
  })
  .on("GET", "/api/conversation", (_req, res, _params, url) => {
    const environmentId = parseId(url.searchParams.get("environment_id") ?? "");
    environments.mustGet(environmentId);
    sendJson(res, 200, list(conversations.list(environmentId)));
  })
  .on("POST", "/api/conversation", async (req, res) => {
    const body = await readJson<{ environment_id?: number }>(req);
    const environment = environments.mustGet(Number(body.environment_id));
    sendJson(res, 200, conversations.create(environment));
  })
  .on("GET", "/api/conversation/:id", (_req, res, params) => {
    sendJson(res, 200, conversations.toJson(conversations.mustGet(params.id)));
  })
  .on("DELETE", "/api/conversation/:id", async (_req, res, params) => {
    const row = conversations.mustGet(params.id);
    await conversations.delete(row, store.getEnvironment(row.environmentId));
    sendJson(res, 204);
  })
  .on("GET", "/api/conversation/:id/messages", (_req, res, params) => {
    sendJson(res, 200, { data: conversations.messages(params.id) });
  })
  .on("POST", "/api/conversation/:id/prompt", async (req, res, params) => {
    const row = conversations.mustGet(params.id);
    const body = await readJson<{ message?: string }>(req);
    try {
      await conversations.prompt(row, environments.mustGet(row.environmentId), body.message ?? "");
    } catch (error) {
      throw toHttpError(error);
    }
    sendJson(res, 202, conversations.toJson(conversations.mustGet(row.id)));
  })
  .on("POST", "/api/conversation/:id/abort", async (_req, res, params) => {
    const row = conversations.mustGet(params.id);
    try {
      await conversations.abort(row, environments.mustGet(row.environmentId));
    } catch (error) {
      throw toHttpError(error);
    }
    sendJson(res, 202, conversations.toJson(row));
  })
  .on("GET", "/api/conversation/:id/events", (_req, res, params) => {
    conversations.mustGet(params.id);
    openEventStream(res);
    conversations.subscribe(params.id, res);
  });

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const requested = normalize(join(STATIC_DIR, decodeURIComponent(url.pathname)));
  const file =
    requested.startsWith(STATIC_DIR) && existsSync(requested) && statSync(requested).isFile()
      ? requested
      : join(STATIC_DIR, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Build the frontend with `npm run build`, or use `npm run dev`.");
    return;
  }
  res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}

createServer((req, res) => {
  router
    .handle(req, res)
    .then((handled) => {
      if (handled) {
        return;
      }
      if ((req.url ?? "").startsWith("/api/")) {
        sendJson(res, 404, { code: "not_found", message: "No such route" });
        return;
      }
      serveStatic(req, res);
    })
    .catch((error: unknown) => sendError(res, error));
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`app listening on http://localhost:${PORT}, data in ${DATA_DIR}\n`);
  environments.reconcile().catch((error: unknown) => process.stderr.write(`reconcile: ${String(error)}\n`));
});
