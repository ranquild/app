import type { ScheduleSettings } from "./settings";

export type DatabaseId = number;
export type DatabaseEngine = "postgres" | "h2" | string;

export type DatabaseDetails = Record<string, unknown>;

export interface Database {
  id: DatabaseId;
  name: string;
  engine: DatabaseEngine;
  details: DatabaseDetails;
  creator_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDatabaseRequest {
  name: string;
  engine: DatabaseEngine;
  details: DatabaseDetails;
}

export interface UpdateDatabaseRequest extends Partial<CreateDatabaseRequest> {
  id: DatabaseId;
}

export type DatabaseSettings = {
  [key: string]: unknown;
  "database-enable-actions"?: boolean;
};

export interface DatabaseData {
  id?: DatabaseId;
  name: string;
  engine: string | undefined;
  /** Hosting provider detected from the connection details, e.g. "AWS RDS" */
  provider_name?: string | null;
  details?: Record<string, unknown>;
  write_data_details?: Record<string, unknown> | null;
  admin_details?: Record<string, unknown> | null;
  schedules: DatabaseSchedules;
  auto_run_queries: boolean | null;
  refingerprint: boolean | null;
  cache_ttl: number | null;
  is_sample: boolean;
  is_full_sync: boolean;
  is_on_demand: boolean;
  settings?: DatabaseSettings | null;
}

export interface DatabaseSchedules {
  metadata_sync?: ScheduleSettings;
  cache_field_values?: ScheduleSettings | null;
}
