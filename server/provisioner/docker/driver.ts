import { existsSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";

import type { ServiceName } from "../../../shared/protocol.ts";
import { HttpError } from "../../http.ts";
import { type Driver, type DriverEnvironment, type Inspection, type Placement, poll } from "../driver.ts";

import { type Images, type Ports, compose, renderProject, serviceStates } from "./compose.ts";

const UP_TIMEOUT_MS = 20 * 60 * 1000;
const EXIT_GRACE_MS = 30 * 1000;

export type DockerDriverOptions = {
  dataDir: string;
  images: Images;
  portRange: { start: number; end: number };
};

function lastLines(text: string, count = 20) {
  return text.trim().split("\n").slice(-count).join("\n");
}

function portsOf(environment: DriverEnvironment): Ports {
  return environment.placement.ports as Ports;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

export function createDockerDriver({ dataDir, images, portRange }: DockerDriverOptions): Driver {
  const dir = (id: string) => join(dataDir, id);

  const failure = async (id: string, message: string) => {
    const logs = await compose(dir(id), id, ["logs", "--no-color", "--tail", "15", "metabase", "agent"]);
    return new Error(`${message}\n${lastLines(logs.stdout, 30)}`);
  };

  return {
    name: "docker",

    async place(_id, others) {
      const used = new Set(others.flatMap((other) => Object.values(portsOf(other) ?? {})));
      const free: number[] = [];
      for (let port = portRange.start; port <= portRange.end && free.length < 2; port += 1) {
        if (!used.has(port) && (await isPortFree(port))) {
          free.push(port);
        }
      }
      if (free.length < 2) {
        throw new HttpError(503, "agent_error", "No free ports left");
      }
      return { ports: { metabase: free[0], agent: free[1] } };
    },

    async up(environment, isCurrent): Promise<Placement> {
      const { id, spec, placement } = environment;
      renderProject(dir(id), id, spec, images, portsOf(environment));
      const result = await compose(dir(id), id, ["up", "--detach", "--remove-orphans"], UP_TIMEOUT_MS);
      if (result.code !== 0) {
        throw await failure(id, `docker compose up failed: ${lastLines(result.stderr)}`);
      }
      await poll(
        isCurrent,
        UP_TIMEOUT_MS,
        3000,
        async (elapsed) => {
          const services = await serviceStates(dir(id), id);
          if (services.metabase === "running" && services.agent === "running") {
            return true;
          }
          const exited = Object.entries(services).find(([, state]) => ["failed", "stopped", "missing"].includes(state));
          if (exited && elapsed > EXIT_GRACE_MS) {
            throw await failure(id, `The ${exited[0]} container is ${exited[1]}`);
          }
          return null;
        },
        () => failure(id, "Timed out waiting for Metabase and the agent to become healthy"),
      );
      return placement;
    },

    async stop(environment) {
      const result = await compose(dir(environment.id), environment.id, ["stop"]);
      if (result.code !== 0) {
        throw new Error(`docker compose stop failed: ${lastLines(result.stderr)}`);
      }
      return environment.placement;
    },

    async destroy(environment) {
      if (!existsSync(join(dir(environment.id), "compose.json"))) {
        return;
      }
      const result = await compose(dir(environment.id), environment.id, ["down", "--volumes", "--remove-orphans"]);
      if (result.code !== 0) {
        throw new Error(`docker compose down failed: ${lastLines(result.stderr)}`);
      }
    },

    async inspect(environment): Promise<Inspection> {
      const ports = portsOf(environment);
      const services = existsSync(join(dir(environment.id), "compose.json"))
        ? await serviceStates(dir(environment.id), environment.id)
        : { metabase: "missing" as const, agent: "missing" as const };
      return {
        services,
        endpoints: {
          metabase: { kind: "http", url: `http://localhost:${ports.metabase}` },
          agent: { kind: "http", url: `http://127.0.0.1:${ports.agent}` },
        },
      };
    },

    async logs(environment, service: ServiceName | null, tail) {
      const args = ["logs", "--no-color", "--tail", String(tail)];
      if (service) {
        args.push(service);
      }
      const result = await compose(dir(environment.id), environment.id, args);
      return result.stdout + result.stderr;
    },
  };
}
