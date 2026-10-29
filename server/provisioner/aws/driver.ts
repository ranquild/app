import { randomInt, randomUUID } from "node:crypto";

import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
  StopRuntimeSessionCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { CloudWatchLogsClient, FilterLogEventsCommand, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  DeregisterTaskDefinitionCommand,
  DescribeTasksCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
  StopTaskCommand,
  type Task,
} from "@aws-sdk/client-ecs";
import {
  CreateRuleCommand,
  CreateTargetGroupCommand,
  DeleteRuleCommand,
  DeleteTargetGroupCommand,
  DeregisterTargetsCommand,
  ElasticLoadBalancingV2Client,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  PutSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

import type { EnvironmentSpec, ServiceName, ServiceState } from "../../../shared/protocol.ts";
import { type Driver, type DriverEnvironment, type Inspection, type Placement, poll } from "../driver.ts";

const UP_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 5000;
const METABASE_PORT = 3000;
const APPDB_PASSWORD = "metabase";

const METABASE_ENTRYPOINT =
  "printf '%s' \"$MB_CONFIG_YML\" > /tmp/config.yml && unset MB_CONFIG_YML && " +
  "export MB_CONFIG_FILE_PATH=/tmp/config.yml && exec /app/run_metabase.sh";

export type AwsDriverOptions = {
  cluster: string;
  subnets: string[];
  securityGroups: string[];
  executionRoleArn: string;
  logGroup: string;
  agentRuntimeArn: string;
  agentLogGroup: string | null;
  agentEgress: string[];
  vpcId: string;
  listenerArn: string;
  metabaseDomain: string;
  secretPrefix: string;
  images: { metabase: string; appdb: string };
};

type AwsPlacement = {
  sessionId: string;
  rulePriority: number;
  secretArn: string | null;
  taskDefinitionArn: string | null;
  taskArn: string | null;
  privateIp: string | null;
  targetGroupArn: string | null;
  ruleArn: string | null;
  configured: boolean;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} to use the aws provisioner driver`);
  }
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function awsOptionsFromEnv(): AwsDriverOptions {
  return {
    cluster: required("AWS_ECS_CLUSTER"),
    subnets: list(required("AWS_SUBNETS")),
    securityGroups: list(required("AWS_METABASE_SECURITY_GROUPS")),
    executionRoleArn: required("AWS_EXECUTION_ROLE_ARN"),
    logGroup: process.env.AWS_LOG_GROUP ?? "/app/environments",
    agentRuntimeArn: required("AWS_AGENT_RUNTIME_ARN"),
    agentLogGroup: process.env.AWS_AGENT_LOG_GROUP ?? null,
    agentEgress: list(process.env.AWS_AGENT_EGRESS),
    vpcId: required("AWS_VPC_ID"),
    listenerArn: required("AWS_ALB_LISTENER_ARN"),
    metabaseDomain: required("AWS_METABASE_DOMAIN"),
    secretPrefix: process.env.AWS_SECRET_PREFIX ?? "app/",
    images: {
      metabase: process.env.METABASE_IMAGE ?? "metabase/metabase-enterprise:latest",
      appdb: process.env.APPDB_IMAGE ?? "postgres:17-alpine",
    },
  };
}

function placementOf(environment: DriverEnvironment): AwsPlacement {
  return environment.placement as AwsPlacement;
}

function privateIpOf(task: Task | undefined): string | null {
  const details = task?.attachments?.flatMap((attachment) => attachment.details ?? []) ?? [];
  return details.find((detail) => detail.name === "privateIPv4Address")?.value ?? null;
}

function metabaseState(task: Task | undefined): ServiceState {
  if (!task) {
    return "missing";
  }
  const container = task.containers?.find((candidate) => candidate.name === "metabase");
  if (task.lastStatus === "STOPPED" || container?.lastStatus === "STOPPED") {
    return container?.exitCode && container.exitCode !== 0 ? "failed" : "stopped";
  }
  if (task.lastStatus === "RUNNING" && container?.healthStatus === "HEALTHY") {
    return "running";
  }
  return container?.healthStatus === "UNHEALTHY" ? "failed" : "starting";
}

export function createAwsDriver(options: AwsDriverOptions): Driver {
  const ecs = new ECSClient({});
  const elb = new ElasticLoadBalancingV2Client({});
  const secrets = new SecretsManagerClient({});
  const logs = new CloudWatchLogsClient({});
  const agentcore = new BedrockAgentCoreClient({});

  const publicUrl = (id: string) => `https://${id}.${options.metabaseDomain}`;

  const describeTask = async (taskArn: string | null) => {
    if (!taskArn) {
      return undefined;
    }
    const output = await ecs.send(new DescribeTasksCommand({ cluster: options.cluster, tasks: [taskArn] }));
    return output.tasks?.[0];
  };

  const putSecret = async (id: string, values: Record<string, string>): Promise<string> => {
    const name = `${options.secretPrefix}${id}/metabase`;
    const secretString = JSON.stringify(values);
    try {
      const output = await secrets.send(new PutSecretValueCommand({ SecretId: name, SecretString: secretString }));
      return output.ARN as string;
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) {
        throw error;
      }
      const output = await secrets.send(
        new CreateSecretCommand({ Name: name, SecretString: secretString, Tags: [{ Key: "app-environment", Value: id }] }),
      );
      return output.ARN as string;
    }
  };

  const registerTaskDefinition = async (id: string, spec: EnvironmentSpec, secretArn: string): Promise<string> => {
    const environment = {
      ...spec.metabase.env,
      MB_DB_TYPE: "postgres",
      MB_DB_HOST: "localhost",
      MB_DB_PORT: "5432",
      MB_DB_DBNAME: "metabase",
      MB_DB_USER: "metabase",
      MB_DB_PASS: APPDB_PASSWORD,
      MB_SITE_URL: publicUrl(id),
    };
    const logConfiguration = (container: string) => ({
      logDriver: "awslogs" as const,
      options: {
        "awslogs-group": options.logGroup,
        "awslogs-region": process.env.AWS_REGION ?? "us-east-1",
        "awslogs-stream-prefix": `${id}-${container}`,
        "awslogs-create-group": "true",
      },
    });
    const output = await ecs.send(
      new RegisterTaskDefinitionCommand({
        family: `app-${id}`,
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu: "2048",
        memory: "4096",
        executionRoleArn: options.executionRoleArn,
        tags: [{ key: "app-environment", value: id }],
        containerDefinitions: [
          {
            name: "appdb",
            image: options.images.appdb,
            essential: true,
            environment: [
              { name: "POSTGRES_USER", value: "metabase" },
              { name: "POSTGRES_DB", value: "metabase" },
              { name: "POSTGRES_PASSWORD", value: APPDB_PASSWORD },
            ],
            healthCheck: { command: ["CMD-SHELL", "pg_isready -U metabase -d metabase"], interval: 5, retries: 30 },
            logConfiguration: logConfiguration("appdb"),
          },
          {
            name: "metabase",
            image: options.images.metabase,
            essential: true,
            entryPoint: ["/bin/bash", "-c", METABASE_ENTRYPOINT],
            environment: Object.entries(environment).map(([name, value]) => ({ name, value })),
            secrets: Object.keys(spec.metabase.secrets).map((name) => ({ name, valueFrom: `${secretArn}:${name}::` })),
            portMappings: [{ containerPort: METABASE_PORT, protocol: "tcp" }],
            dependsOn: [{ containerName: "appdb", condition: "HEALTHY" }],
            healthCheck: {
              command: ["CMD-SHELL", `curl -fsS http://localhost:${METABASE_PORT}/api/health || exit 1`],
              interval: 10,
              retries: 10,
              startPeriod: 120,
            },
            logConfiguration: logConfiguration("metabase"),
          },
        ],
      }),
    );
    return output.taskDefinition?.taskDefinitionArn as string;
  };

  const ensureRoute = async (id: string, placement: AwsPlacement): Promise<AwsPlacement> => {
    if (placement.targetGroupArn && placement.ruleArn) {
      return placement;
    }
    const targetGroup = await elb.send(
      new CreateTargetGroupCommand({
        Name: `app-${id}`.slice(0, 32),
        Protocol: "HTTP",
        Port: METABASE_PORT,
        VpcId: options.vpcId,
        TargetType: "ip",
        HealthCheckPath: "/api/health",
        Tags: [{ Key: "app-environment", Value: id }],
      }),
    );
    const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn as string;
    const rule = await elb.send(
      new CreateRuleCommand({
        ListenerArn: options.listenerArn,
        Priority: placement.rulePriority,
        Conditions: [{ Field: "host-header", HostHeaderConfig: { Values: [`${id}.${options.metabaseDomain}`] } }],
        Actions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
      }),
    );
    return { ...placement, targetGroupArn, ruleArn: rule.Rules?.[0]?.RuleArn ?? null };
  };

  const deregister = async (placement: AwsPlacement) => {
    if (placement.targetGroupArn && placement.privateIp) {
      await elb.send(
        new DeregisterTargetsCommand({
          TargetGroupArn: placement.targetGroupArn,
          Targets: [{ Id: placement.privateIp, Port: METABASE_PORT }],
        }),
      );
    }
  };

  const configureAgent = async (id: string, spec: EnvironmentSpec, placement: AwsPlacement, privateIp: string) => {
    const env = {
      ...spec.agent.env,
      ...spec.agent.secrets,
      MB_URL: `http://${privateIp}:${METABASE_PORT}`,
      MB_PUBLIC_URL: publicUrl(id),
    };
    const output = await agentcore.send(
      new InvokeAgentRuntimeCommand({
        agentRuntimeArn: options.agentRuntimeArn,
        runtimeSessionId: placement.sessionId,
        contentType: "application/json",
        accept: "application/json",
        payload: new TextEncoder().encode(JSON.stringify({ method: "PUT", path: "/configure", body: { env } })),
      }),
    );
    const envelope = JSON.parse((await output.response?.transformToString()) ?? "null") as {
      status: number;
      body: { message?: string } | null;
    } | null;
    if (!envelope || envelope.status >= 400) {
      throw new Error(`The agent rejected its configuration: ${envelope?.body?.message ?? "no response"}`);
    }
  };

  const stopTask = async (placement: AwsPlacement, reason: string) => {
    if (placement.taskArn) {
      await ecs.send(new StopTaskCommand({ cluster: options.cluster, task: placement.taskArn, reason }));
    }
  };

  return {
    name: "aws",

    async place(id, others) {
      const used = new Set(others.map((other) => placementOf(other).rulePriority));
      let rulePriority = randomInt(1, 50000);
      while (used.has(rulePriority)) {
        rulePriority = randomInt(1, 50000);
      }
      const placement: AwsPlacement = {
        sessionId: `${id}-${randomUUID()}`,
        rulePriority,
        secretArn: null,
        taskDefinitionArn: null,
        taskArn: null,
        privateIp: null,
        targetGroupArn: null,
        ruleArn: null,
        configured: false,
      };
      return placement as unknown as Placement;
    },

    async up(environment, isCurrent): Promise<Placement> {
      const { id, spec } = environment;
      const blocked = spec.agent.egress.filter((host) => !options.agentEgress.includes(host));
      if (blocked.length > 0) {
        throw new Error(`The agent runtime's network does not allow ${blocked.join(", ")}; add them to AWS_AGENT_EGRESS`);
      }
      let placement = { ...placementOf(environment), configured: false };
      placement.secretArn = await putSecret(id, spec.metabase.secrets);
      placement.taskDefinitionArn = await registerTaskDefinition(id, spec, placement.secretArn);
      await deregister(placement);
      await stopTask(placement, "Replaced by a new start");
      const run = await ecs.send(
        new RunTaskCommand({
          cluster: options.cluster,
          taskDefinition: placement.taskDefinitionArn,
          launchType: "FARGATE",
          count: 1,
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: options.subnets,
              securityGroups: options.securityGroups,
              assignPublicIp: "DISABLED",
            },
          },
          tags: [{ key: "app-environment", value: id }],
        }),
      );
      placement.taskArn = run.tasks?.[0]?.taskArn ?? null;
      if (!placement.taskArn) {
        throw new Error(`RunTask failed: ${run.failures?.map((failure) => failure.reason).join(", ") ?? "no task"}`);
      }
      const task = await poll(
        isCurrent,
        UP_TIMEOUT_MS,
        POLL_MS,
        async () => {
          const current = await describeTask(placement.taskArn);
          const state = metabaseState(current);
          if (state === "stopped" || state === "failed") {
            throw new Error(`The Metabase task stopped: ${current?.stoppedReason ?? state}`);
          }
          return state === "running" ? current : null;
        },
        async () => new Error("Timed out waiting for Metabase to become healthy"),
      );
      const privateIp = privateIpOf(task);
      if (!privateIp) {
        throw new Error("The Metabase task has no private IP");
      }
      placement.privateIp = privateIp;
      placement = await ensureRoute(id, placement);
      await elb.send(
        new RegisterTargetsCommand({
          TargetGroupArn: placement.targetGroupArn as string,
          Targets: [{ Id: privateIp, Port: METABASE_PORT }],
        }),
      );
      await configureAgent(id, spec, placement, privateIp);
      placement.configured = true;
      return placement as unknown as Placement;
    },

    async stop(environment) {
      const placement = placementOf(environment);
      await deregister(placement);
      await stopTask(placement, "Stopped by the app");
      await agentcore
        .send(new StopRuntimeSessionCommand({ agentRuntimeArn: options.agentRuntimeArn, runtimeSessionId: placement.sessionId }))
        .catch(() => undefined);
      return { ...placement, taskArn: null, privateIp: null, configured: false } as unknown as Placement;
    },

    async destroy(environment) {
      const placement = placementOf(environment);
      await this.stop(environment);
      if (placement.ruleArn) {
        await elb.send(new DeleteRuleCommand({ RuleArn: placement.ruleArn }));
      }
      if (placement.targetGroupArn) {
        await elb.send(new DeleteTargetGroupCommand({ TargetGroupArn: placement.targetGroupArn }));
      }
      if (placement.secretArn) {
        await secrets.send(new DeleteSecretCommand({ SecretId: placement.secretArn, ForceDeleteWithoutRecovery: true }));
      }
      if (placement.taskDefinitionArn) {
        await ecs.send(new DeregisterTaskDefinitionCommand({ taskDefinition: placement.taskDefinitionArn }));
      }
    },

    async inspect(environment): Promise<Inspection> {
      const placement = placementOf(environment);
      const metabase = metabaseState(await describeTask(placement.taskArn));
      const agent: ServiceState = metabase === "running" && placement.configured ? "running" : metabase === "running" ? "starting" : "stopped";
      return {
        services: { metabase, agent },
        endpoints: {
          metabase: { kind: "http", url: publicUrl(environment.id) },
          agent: { kind: "agentcore", runtimeArn: options.agentRuntimeArn, sessionId: placement.sessionId },
        },
      };
    },

    async logs(environment, service: ServiceName | null, tail) {
      const placement = placementOf(environment);
      const lines: string[] = [];
      if (service !== "agent" && placement.taskArn) {
        const taskId = placement.taskArn.split("/").pop();
        const output = await logs
          .send(
            new GetLogEventsCommand({
              logGroupName: options.logGroup,
              logStreamName: `${environment.id}-metabase/metabase/${taskId}`,
              limit: tail,
              startFromHead: false,
            }),
          )
          .catch(() => ({ events: [] }));
        lines.push(...(output.events ?? []).map((event) => `metabase | ${event.message ?? ""}`));
      }
      if (service !== "metabase" && options.agentLogGroup) {
        const output = await logs
          .send(new FilterLogEventsCommand({ logGroupName: options.agentLogGroup, limit: tail }))
          .catch(() => ({ events: [] }));
        lines.push(...(output.events ?? []).map((event) => `agent | ${event.message ?? ""}`));
      }
      return lines.join("\n");
    },
  };
}
