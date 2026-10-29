import { homedir } from "node:os";
import { join } from "node:path";

import type { Driver } from "./driver.ts";
import { startProvisioner } from "./service.ts";

const DRIVER = process.env.PROVISIONER_DRIVER ?? "docker";
const DATA_DIR = process.env.PROVISIONER_DATA_DIR ?? join(homedir(), ".app", "provisioner");

async function createDriver(): Promise<Driver> {
  if (DRIVER === "aws") {
    const { createAwsDriver, awsOptionsFromEnv } = await import("./aws/driver.ts");
    return createAwsDriver(awsOptionsFromEnv());
  }
  const { createDockerDriver } = await import("./docker/driver.ts");
  return createDockerDriver({
    dataDir: DATA_DIR,
    images: {
      metabase: process.env.METABASE_IMAGE ?? "metabase/metabase-enterprise:latest",
      appdb: process.env.APPDB_IMAGE ?? "postgres:17-alpine",
      agent: process.env.AGENT_IMAGE ?? "app-agent:dev",
      proxy: process.env.PROXY_IMAGE ?? "app-proxy:dev",
      socat: process.env.SOCAT_IMAGE ?? "alpine/socat:latest",
    },
    portRange: {
      start: Number(process.env.PROVISIONER_PORT_RANGE_START ?? 4100),
      end: Number(process.env.PROVISIONER_PORT_RANGE_END ?? 4999),
    },
  });
}

startProvisioner({
  driver: await createDriver(),
  port: Number(process.env.PROVISIONER_PORT ?? 4000),
  host: process.env.PROVISIONER_HOST ?? "127.0.0.1",
  token: process.env.PROVISIONER_TOKEN ?? "",
  dataDir: DATA_DIR,
});
