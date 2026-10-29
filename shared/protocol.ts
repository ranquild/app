import type { FileEntry, JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";

export type ServiceName = "metabase" | "agent";

export type ServiceSpec = {
  env: Record<string, string>;
  secrets: Record<string, string>;
};

export type AgentSpec = {
  env: Record<string, string>;
  secrets: Record<string, string>;
  egress: string[];
};

export type EnvironmentSpec = {
  metabase: ServiceSpec;
  agent: AgentSpec;
};

export type ProvisionedState = "starting" | "running" | "stopping" | "stopped" | "deleting" | "error";

export type ServiceState = "starting" | "running" | "stopped" | "failed" | "missing";

export type HttpEndpoint = { kind: "http"; url: string };

export type Endpoints = {
  metabase: HttpEndpoint;
  agent: HttpEndpoint;
};

export type ProvisionedEnvironment = {
  id: string;
  state: ProvisionedState;
  services: Record<ServiceName, ServiceState>;
  endpoints: Endpoints | null;
  error: string | null;
};

export type ProvisionedEnvironmentList = {
  data: ProvisionedEnvironment[];
};

export type AgentConversationState = "idle" | "running";

export type AgentConversation = {
  id: string;
  state: AgentConversationState;
  seq: number;
};

export type AgentConversationList = {
  data: AgentConversation[];
};

export type OpenConversationRequest = {
  entries: FileEntry[];
};

export type PromptRequest = {
  message: string;
};

export type AgentRecord =
  | { seq: number; kind: "event"; event: JsonAgentSessionEvent }
  | { seq: number; kind: "entry"; entry: FileEntry };

export type ErrorCode =
  | "not_found"
  | "conversation_running"
  | "unauthorized"
  | "bad_request"
  | "agent_error";

export type ErrorBody = {
  code: ErrorCode;
  message: string;
};

export const AGENT_PORT = 8080;
export const METABASE_PORT = 3000;
export const AGENT_PROJECT_DIR = "/data/project";
export const AGENT_SESSION_DIR = "/tmp/conversations";
