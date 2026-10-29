import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  EnvironmentSpec,
  ProvisionedEnvironment,
  ProvisionedState,
} from "../../shared/protocol.ts";
import { HttpError, Router, readJson, requireBearer, sendError, sendJson } from "../http.ts";

import { type Images, type Ports, compose, renderProject, serviceStates } from "./compose.ts";

const PORT = Number(process.env.PROVISIONER_PORT ?? 4000);
const TOKEN = process.env.PROVISIONER_TOKEN ?? "";
const DATA_DIR = process.env.PROVISIONER_DATA_DIR ?? join(homedir(), ".app", "provisioner");
const PORT_RANGE_START = Number(process.env.PROVISIONER_PORT_RANGE_START ?? 4100);
const PORT_RANGE_END = Number(process.env.PROVISIONER_PORT_RANGE_END ?? 4999);
const UP_TIMEOUT_MS = 20 * 60 * 1000;

const IMAGES: Images = {
  metabase: process.env.METABASE_IMAGE ?? "metabase/metabase-enterprise:latest",
  appdb: process.env.APPDB_IMAGE ?? "postgres:17-alpine",
  agent: process.env.AGENT_IMAGE ?? "app-agent:dev",
  proxy: process.env.PROXY_IMAGE ?? "app-proxy:dev",
  socat: process.env.SOCAT_IMAGE ?? "alpine/socat:latest",
};

type Desired = "running" | "stopped";

type Stored = {
  id: string;
  ports: Ports;
  desired: Desired;
  spec: EnvironmentSpec;
};

type Live = {
  stored: Stored;
  state: ProvisionedState;
  error: string | null;
  queue: Promise<void>;
  generation: number;
};

class Superseded extends Error {}

const environments = new Map<string, Live>();

function envDir(id: string) {
  return join(DATA_DIR, id);
}

function save(stored: Stored) {
  writeFileSync(join(envDir(stored.id), "environment.json"), JSON.stringify(stored), { mode: 0o600 });
}

function load() {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  for (const id of readdirSync(DATA_DIR)) {
    const file = join(envDir(id), "environment.json");
    if (!existsSync(file)) {
      continue;
    }
    const stored = JSON.parse(readFileSync(file, "utf8")) as Stored;
    environments.set(id, { stored, state: stored.desired, error: null, queue: Promise.resolve(), generation: 0 });
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function allocatePorts(): Promise<Ports> {
  const used = new Set([...environments.values()].flatMap((env) => [env.stored.ports.metabase, env.stored.ports.agent]));
  const free: number[] = [];
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END && free.length < 2; port += 1) {
    if (!used.has(port) && (await isPortFree(port))) {
      free.push(port);
    }
  }
  if (free.length < 2) {
    throw new HttpError(503, "agent_error", "No free ports left");
  }
  return { metabase: free[0], agent: free[1] };
}

function lastLines(text: string, count = 20) {
  return text.trim().split("\n").slice(-count).join("\n");
}

function enqueue(env: Live, state: ProvisionedState, task: (generation: number) => Promise<ProvisionedState>) {
  env.generation += 1;
  const generation = env.generation;
  env.state = state;
  env.error = null;
  env.queue = env.queue
    .then(() => task(generation))
    .then((next) => {
      if (env.generation === generation) {
        env.state = next;
      }
    })
    .catch((error: unknown) => {
      if (error instanceof Superseded || env.generation !== generation) {
        return;
      }
      env.state = "error";
      env.error = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[${env.stored.id}] ${env.error}\n`);
    });
}

async function failure(id: string, message: string): Promise<Error> {
  const logs = await compose(envDir(id), id, ["logs", "--no-color", "--tail", "15", "metabase", "agent"]);
  return new Error(`${message}\n${lastLines(logs.stdout, 30)}`);
}

async function up(env: Live, generation: number): Promise<ProvisionedState> {
  const { id, ports, spec } = env.stored;
  renderProject(envDir(id), id, spec, IMAGES, ports);
  const result = await compose(envDir(id), id, ["up", "--detach", "--remove-orphans"], UP_TIMEOUT_MS);
  if (result.code !== 0) {
    throw await failure(id, `docker compose up failed: ${lastLines(result.stderr)}`);
  }
  const startedAt = Date.now();
  for (;;) {
    if (env.generation !== generation) {
      throw new Superseded();
    }
    const services = await serviceStates(envDir(id), id);
    if (services.metabase === "running" && services.agent === "running") {
      return "running";
    }
    const exited = Object.entries(services).find(([, state]) => state === "failed" || state === "stopped" || state === "missing");
    if (exited && Date.now() - startedAt > 30000) {
      throw await failure(id, `The ${exited[0]} container is ${exited[1]}`);
    }
    if (Date.now() - startedAt > UP_TIMEOUT_MS) {
      throw await failure(id, "Timed out waiting for Metabase and the agent to become healthy");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function stop(env: Live): Promise<ProvisionedState> {
  const result = await compose(envDir(env.stored.id), env.stored.id, ["stop"]);
  if (result.code !== 0) {
    throw new Error(`docker compose stop failed: ${lastLines(result.stderr)}`);
  }
  return "stopped";
}

async function destroy(env: Live): Promise<ProvisionedState> {
  const { id } = env.stored;
  const result = await compose(envDir(id), id, ["down", "--volumes", "--remove-orphans"]);
  if (result.code !== 0) {
    throw new Error(`docker compose down failed: ${lastLines(result.stderr)}`);
  }
  rmSync(envDir(id), { recursive: true, force: true });
  environments.delete(id);
  return "deleting";
}

async function describe(env: Live): Promise<ProvisionedEnvironment> {
  const { id, ports } = env.stored;
  const services = existsSync(envDir(id))
    ? await serviceStates(envDir(id), id)
    : { metabase: "missing" as const, agent: "missing" as const };
  const isRunning = env.state === "running";
  return {
    id,
    state: env.state,
    services,
    endpoints: isRunning
      ? {
          metabase: { kind: "http", url: `http://localhost:${ports.metabase}` },
          agent: { kind: "http", url: `http://127.0.0.1:${ports.agent}` },
        }
      : null,
    error: env.error,
  };
}

function getEnv(id: string): Live {
  const env = environments.get(id);
  if (!env) {
    throw new HttpError(404, "not_found", `No environment ${id}`);
  }
  return env;
}

function validateSpec(spec: EnvironmentSpec): EnvironmentSpec {
  const isRecord = (value: unknown) => value != null && typeof value === "object" && !Array.isArray(value);
  if (
    !isRecord(spec?.metabase?.env) ||
    !isRecord(spec?.metabase?.secrets) ||
    !isRecord(spec?.agent?.env) ||
    !isRecord(spec?.agent?.secrets) ||
    !Array.isArray(spec?.agent?.egress)
  ) {
    throw new HttpError(400, "bad_request", "The spec needs metabase.{env,secrets} and agent.{env,secrets,egress}");
  }
  return {
    metabase: { env: spec.metabase.env, secrets: spec.metabase.secrets },
    agent: { env: spec.agent.env, secrets: spec.agent.secrets, egress: spec.agent.egress.map(String) },
  };
}

const router = new Router()
  .on("GET", "/environments", async (_req, res) => {
    sendJson(res, 200, { data: await Promise.all([...environments.values()].map(describe)) });
  })
  .on("POST", "/environments", async (req, res) => {
    const spec = validateSpec(await readJson<EnvironmentSpec>(req));
    const id = `env-${randomBytes(4).toString("hex")}`;
    const stored: Stored = { id, ports: await allocatePorts(), desired: "running", spec };
    mkdirSync(envDir(id), { recursive: true, mode: 0o700 });
    save(stored);
    const env: Live = { stored, state: "starting", error: null, queue: Promise.resolve(), generation: 0 };
    environments.set(id, env);
    enqueue(env, "starting", (generation) => up(env, generation));
    sendJson(res, 201, await describe(env));
  })
  .on("GET", "/environments/:id", async (_req, res, params) => {
    sendJson(res, 200, await describe(getEnv(params.id)));
  })
  .on("PUT", "/environments/:id", async (req, res, params) => {
    const env = getEnv(params.id);
    env.stored.spec = validateSpec(await readJson<EnvironmentSpec>(req));
    save(env.stored);
    if (env.stored.desired === "running") {
      enqueue(env, "starting", (generation) => up(env, generation));
    } else {
      renderProject(envDir(env.stored.id), env.stored.id, env.stored.spec, IMAGES, env.stored.ports);
    }
    sendJson(res, 202, await describe(env));
  })
  .on("POST", "/environments/:id/start", async (_req, res, params) => {
    const env = getEnv(params.id);
    env.stored.desired = "running";
    save(env.stored);
    enqueue(env, "starting", (generation) => up(env, generation));
    sendJson(res, 202, await describe(env));
  })
  .on("POST", "/environments/:id/stop", async (_req, res, params) => {
    const env = getEnv(params.id);
    env.stored.desired = "stopped";
    save(env.stored);
    enqueue(env, "stopping", () => stop(env));
    sendJson(res, 202, await describe(env));
  })
  .on("DELETE", "/environments/:id", async (_req, res, params) => {
    const env = getEnv(params.id);
    enqueue(env, "deleting", () => destroy(env));
    sendJson(res, 202, { id: env.stored.id, state: "deleting" });
  })
  .on("GET", "/environments/:id/logs", async (_req, res, params, url) => {
    const env = getEnv(params.id);
    const service = url.searchParams.get("service");
    const tail = Number(url.searchParams.get("tail") ?? 200);
    const args = ["logs", "--no-color", "--tail", String(Number.isFinite(tail) ? tail : 200)];
    if (service === "metabase" || service === "agent") {
      args.push(service);
    }
    const result = await compose(envDir(env.stored.id), env.stored.id, args);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(result.stdout + result.stderr);
  });

load();

createServer((req, res) => {
  try {
    requireBearer(req, TOKEN);
  } catch (error) {
    sendError(res, error);
    return;
  }
  router.handle(req, res).then((handled) => {
    if (!handled) {
      sendJson(res, 404, { code: "not_found", message: "No such route" });
    }
  });
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`provisioner (docker) listening on http://127.0.0.1:${PORT}, data in ${DATA_DIR}\n`);
});
