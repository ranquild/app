export type EnvironmentId = number;

export type EnvironmentStatus = "creating" | "running" | "stopped" | "error" | "deleting";

export interface Environment {
  id: EnvironmentId;
  name: string;
  status: EnvironmentStatus;
  metabase_url: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListEnvironmentsRequest {
  search?: string;
}

export interface CreateEnvironmentRequest {
  name: string;
}

export interface EnvironmentCredentials {
  email: string;
  password: string;
}

export interface EnvironmentLogsRequest {
  id: EnvironmentId;
  service?: "agent" | "metabase";
  tail?: number;
}
