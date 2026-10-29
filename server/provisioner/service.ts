import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import type {
  EnvironmentSpec,
  ProvisionedEnvironment,
  ProvisionedState,
  ServiceName,
} from "../../shared/protocol.ts";
import { HttpError, Router, readJson, requireBearer, sendError, sendJson } from "../http.ts";

import { type Driver, type DriverEnvironment, type Placement, Superseded } from "./driver.ts";

type Desired = "running" | "stopped";

type Stored = {
  id: string;
  desired: Desired;
  spec: EnvironmentSpec;
  placement: Placement;
};

type Live = {
  stored: Stored;
  state: ProvisionedState;
  error: string | null;
  queue: Promise<void>;
  generation: number;
};

export type ServiceOptions = {
  driver: Driver;
  port: number;
  host: string;
  token: string;
  dataDir: string;
};

export function validateSpec(spec: EnvironmentSpec): EnvironmentSpec {
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

export function startProvisioner({ driver, port, host, token, dataDir }: ServiceOptions) {
  const environments = new Map<string, Live>();

  const envDir = (id: string) => join(dataDir, id);

  const save = (stored: Stored) => {
    mkdirSync(envDir(stored.id), { recursive: true, mode: 0o700 });
    writeFileSync(join(envDir(stored.id), "environment.json"), JSON.stringify(stored), { mode: 0o600 });
  };

  const driverEnvironment = (live: Live): DriverEnvironment => ({
    id: live.stored.id,
    spec: live.stored.spec,
    placement: live.stored.placement,
  });

  const load = () => {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    for (const id of readdirSync(dataDir)) {
      const file = join(envDir(id), "environment.json");
      if (!existsSync(file)) {
        continue;
      }
      const raw = JSON.parse(readFileSync(file, "utf8")) as Stored & { ports?: unknown };
      const stored: Stored = {
        id: raw.id,
        desired: raw.desired,
        spec: raw.spec,
        placement: raw.placement ?? { ports: raw.ports },
      };
      environments.set(id, { stored, state: stored.desired, error: null, queue: Promise.resolve(), generation: 0 });
    }
  };

  const enqueue = (live: Live, state: ProvisionedState, task: (isCurrent: () => boolean) => Promise<ProvisionedState>) => {
    live.generation += 1;
    const generation = live.generation;
    const isCurrent = () => live.generation === generation;
    live.state = state;
    live.error = null;
    live.queue = live.queue
      .then(() => task(isCurrent))
      .then((next) => {
        if (isCurrent()) {
          live.state = next;
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Superseded || !isCurrent()) {
          return;
        }
        live.state = "error";
        live.error = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[${live.stored.id}] ${live.error}\n`);
      });
  };

  const up = (live: Live) =>
    enqueue(live, "starting", async (isCurrent) => {
      live.stored.placement = await driver.up(driverEnvironment(live), isCurrent);
      save(live.stored);
      return "running";
    });

  const describe = async (live: Live): Promise<ProvisionedEnvironment> => {
    const inspection = await driver.inspect(driverEnvironment(live)).catch(() => ({
      services: { metabase: "missing" as const, agent: "missing" as const },
      endpoints: null,
    }));
    return {
      id: live.stored.id,
      state: live.state,
      services: inspection.services,
      endpoints: live.state === "running" ? inspection.endpoints : null,
      error: live.error,
    };
  };

  const getLive = (id: string): Live => {
    const live = environments.get(id);
    if (!live) {
      throw new HttpError(404, "not_found", `No environment ${id}`);
    }
    return live;
  };

  const router = new Router()
    .on("GET", "/environments", async (_req, res) => {
      sendJson(res, 200, { data: await Promise.all([...environments.values()].map(describe)) });
    })
    .on("POST", "/environments", async (req, res) => {
      const spec = validateSpec(await readJson<EnvironmentSpec>(req));
      const id = `env-${randomBytes(4).toString("hex")}`;
      const others = [...environments.values()].map(driverEnvironment);
      const stored: Stored = { id, desired: "running", spec, placement: await driver.place(id, others) };
      save(stored);
      const live: Live = { stored, state: "starting", error: null, queue: Promise.resolve(), generation: 0 };
      environments.set(id, live);
      up(live);
      sendJson(res, 201, await describe(live));
    })
    .on("GET", "/environments/:id", async (_req, res, params) => {
      sendJson(res, 200, await describe(getLive(params.id)));
    })
    .on("PUT", "/environments/:id", async (req, res, params) => {
      const live = getLive(params.id);
      live.stored.spec = validateSpec(await readJson<EnvironmentSpec>(req));
      save(live.stored);
      if (live.stored.desired === "running") {
        up(live);
      }
      sendJson(res, 202, await describe(live));
    })
    .on("POST", "/environments/:id/start", async (_req, res, params) => {
      const live = getLive(params.id);
      live.stored.desired = "running";
      save(live.stored);
      up(live);
      sendJson(res, 202, await describe(live));
    })
    .on("POST", "/environments/:id/stop", async (_req, res, params) => {
      const live = getLive(params.id);
      live.stored.desired = "stopped";
      save(live.stored);
      enqueue(live, "stopping", async () => {
        live.stored.placement = await driver.stop(driverEnvironment(live));
        save(live.stored);
        return "stopped";
      });
      sendJson(res, 202, await describe(live));
    })
    .on("DELETE", "/environments/:id", async (_req, res, params) => {
      const live = getLive(params.id);
      enqueue(live, "deleting", async () => {
        await driver.destroy(driverEnvironment(live));
        rmSync(envDir(live.stored.id), { recursive: true, force: true });
        environments.delete(live.stored.id);
        return "deleting";
      });
      sendJson(res, 202, { id: live.stored.id, state: "deleting" });
    })
    .on("GET", "/environments/:id/logs", async (_req, res, params, url) => {
      const live = getLive(params.id);
      const service = url.searchParams.get("service");
      const tail = Number(url.searchParams.get("tail") ?? 200);
      const logs = await driver.logs(
        driverEnvironment(live),
        service === "metabase" || service === "agent" ? (service as ServiceName) : null,
        Number.isFinite(tail) ? tail : 200,
      );
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(logs);
    });

  load();

  createServer((req, res) => {
    try {
      requireBearer(req, token);
    } catch (error) {
      sendError(res, error);
      return;
    }
    router.handle(req, res).then((handled) => {
      if (!handled) {
        sendJson(res, 404, { code: "not_found", message: "No such route" });
      }
    });
  }).listen(port, host, () => {
    process.stdout.write(`provisioner (${driver.name}) listening on http://${host}:${port}, data in ${dataDir}\n`);
  });
}
