import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { EnvironmentSpec, ServiceName, ServiceState } from "../../shared/protocol.ts";

export type Images = {
  metabase: string;
  appdb: string;
  agent: string;
  proxy: string;
  socat: string;
};

export type Ports = {
  metabase: number;
  agent: number;
};

const APPDB_PASSWORD = "metabase";

const METABASE_ENTRYPOINT =
  "printf '%s' \"$$MB_CONFIG_YML\" > /tmp/config.yml && unset MB_CONFIG_YML && " +
  "export MB_CONFIG_FILE_PATH=/tmp/config.yml && exec /app/run_metabase.sh";

export function composeFile(id: string, images: Images, ports: Ports): string {
  return JSON.stringify(
    {
      name: id,
      services: {
        appdb: {
          image: images.appdb,
          restart: "unless-stopped",
          environment: { POSTGRES_USER: "metabase", POSTGRES_DB: "metabase", POSTGRES_PASSWORD: APPDB_PASSWORD },
          volumes: ["appdb:/var/lib/postgresql/data"],
          networks: ["internal"],
          healthcheck: { test: ["CMD-SHELL", "pg_isready -U metabase -d metabase"], interval: "3s", retries: 30 },
        },
        metabase: {
          image: images.metabase,
          restart: "unless-stopped",
          entrypoint: ["/bin/bash", "-c", METABASE_ENTRYPOINT],
          env_file: [{ path: "metabase.env", format: "raw" }],
          environment: {
            MB_DB_TYPE: "postgres",
            MB_DB_HOST: "appdb",
            MB_DB_PORT: "5432",
            MB_DB_DBNAME: "metabase",
            MB_DB_USER: "metabase",
            MB_DB_PASS: APPDB_PASSWORD,
          },
          depends_on: { appdb: { condition: "service_healthy" } },
          extra_hosts: ["host.docker.internal:host-gateway"],
          networks: ["default", "internal"],
          ports: [`127.0.0.1:${ports.metabase}:3000`],
          healthcheck: {
            test: ["CMD-SHELL", "curl -fsS http://localhost:3000/api/health || exit 1"],
            interval: "5s",
            retries: 120,
            start_period: "60s",
          },
        },
        proxy: {
          image: images.proxy,
          restart: "unless-stopped",
          volumes: ["./allowlist:/etc/tinyproxy/allowlist:ro"],
          networks: ["default", "internal"],
        },
        agent: {
          image: images.agent,
          restart: "unless-stopped",
          init: true,
          env_file: [{ path: "agent.env", format: "raw" }],
          environment: {
            MB_URL: "http://metabase:3000",
            MB_PUBLIC_URL: `http://localhost:${ports.metabase}`,
            HTTPS_PROXY: "http://proxy:8888",
            HTTP_PROXY: "http://proxy:8888",
            NO_PROXY: "metabase,localhost,127.0.0.1",
          },
          volumes: ["project:/data/project"],
          networks: ["internal"],
          depends_on: { metabase: { condition: "service_started" }, proxy: { condition: "service_started" } },
          healthcheck: {
            test: ["CMD", "node", "-e", "fetch('http://localhost:8080/ping').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"],
            interval: "3s",
            retries: 60,
            start_period: "10s",
          },
        },
        "agent-port": {
          image: images.socat,
          restart: "unless-stopped",
          command: "TCP-LISTEN:8080,fork,reuseaddr TCP:agent:8080",
          networks: ["default", "internal"],
          ports: [`127.0.0.1:${ports.agent}:8080`],
          depends_on: ["agent"],
        },
      },
      networks: { internal: { internal: true } },
      volumes: { appdb: {}, project: {} },
    },
    null,
    2,
  );
}

function envFile(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`Invalid variable name ${key}`);
      }
      if (/[\r\n]/.test(value)) {
        throw new Error(`The value of ${key} contains a line break`);
      }
      return `${key}=${value}\n`;
    })
    .join("");
}

function writePrivate(path: string, content: string) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function allowlist(hosts: string[]): string {
  return hosts.map((host) => `^${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$\n`).join("");
}

export function renderProject(dir: string, id: string, spec: EnvironmentSpec, images: Images, ports: Ports) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  writePrivate(join(dir, "metabase.env"), envFile({ ...spec.metabase.env, ...spec.metabase.secrets }));
  writePrivate(join(dir, "agent.env"), envFile({ ...spec.agent.env, ...spec.agent.secrets }));
  writeFileSync(join(dir, "allowlist"), allowlist(spec.agent.egress));
  writeFileSync(join(dir, "compose.json"), composeFile(id, images, ports));
}

export type RunResult = { code: number; stdout: string; stderr: string };

export function compose(dir: string, id: string, args: string[], timeoutMs = 120000): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", "--project-name", id, "--file", join(dir, "compose.json"), ...args], {
      cwd: dir,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

type PsRow = { Service?: string; State?: string; Health?: string; ExitCode?: number };

function parsePs(output: string): PsRow[] {
  const trimmed = output.trim();
  if (trimmed === "") {
    return [];
  }
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as PsRow[];
  }
  return trimmed.split("\n").filter(Boolean).map((line) => JSON.parse(line) as PsRow);
}

function serviceState(row: PsRow | undefined): ServiceState {
  if (!row) {
    return "missing";
  }
  const state = (row.State ?? "").toLowerCase();
  const health = (row.Health ?? "").toLowerCase();
  if (state === "running") {
    return health === "" || health === "healthy" ? "running" : "starting";
  }
  if (state === "restarting" || state === "created") {
    return "starting";
  }
  return row.ExitCode && row.ExitCode !== 0 ? "failed" : "stopped";
}

export async function serviceStates(dir: string, id: string): Promise<Record<ServiceName, ServiceState>> {
  const result = await compose(dir, id, ["ps", "--all", "--format", "json"]);
  const rows = result.code === 0 ? parsePs(result.stdout) : [];
  const find = (service: string) => rows.find((row) => row.Service === service);
  return { metabase: serviceState(find("metabase")), agent: serviceState(find("agent")) };
}
