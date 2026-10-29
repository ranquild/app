export type ColorSettings = Record<string, string>;

/** One entry of `GET /api/setting`. */
export interface SettingDefinition {
  key: string;
  value: unknown;
  is_env_setting: boolean;
  env_name: string;
  description: string;
  default: unknown;
}

/** Public and authenticated settings from `GET /api/session/properties`. */
export interface EnterpriseSettings {
  "application-colors"?: ColorSettings | null;
  "application-font"?: string;
  "cloud-gateway-ips"?: string[] | null;
  "custom-formatting"?: FormattingSettings;
  engines?: Record<string, Engine>;
  "password-complexity"?: PasswordComplexity;
  version?: Version;
  "site-name"?: string;
  "site-locale"?: string;
  "setup-token"?: string | null;
  "has-user-setup"?: boolean;
  "remote-sync-enabled"?: boolean;
  "admin-email"?: string | null;
  [key: string]: unknown;
}

export type SettingKey = keyof EnterpriseSettings;
export type EnterpriseSettingKey = SettingKey;
export type Settings = EnterpriseSettings;

/** Keys shown on the admin General page. */
export interface GeneralSettings {
  "site-name": string | null;
  "site-url": string | null;
}

export type CurrencyStyle = Intl.NumberFormatOptionsCurrencyDisplay;

export interface FormattingSettings {
  "type/Temporal"?: DateFormattingSettings;
  "type/Number"?: NumberFormattingSettings;
  "type/Currency"?: CurrencyFormattingSettings;
}

export interface DateFormattingSettings {
  date_style?: string;
  date_separator?: string;
  date_abbreviate?: boolean;
  time_style?: string;
}

export interface NumberFormattingSettings {
  number_separators?: string;
}

export interface CurrencyFormattingSettings {
  currency?: string;
  currency_style?: CurrencyStyle;
  currency_in_header?: boolean;
}

export const engineKeys = [
  "athena",
  "bigquery-cloud-sdk",
  "clickhouse",
  "databricks",
  "druid-jdbc",
  "druid",
  "mongo",
  "mysql",
  "oracle",
  "postgres",
  "presto-jdbc",
  "redshift",
  "snowflake",
  "sparksql",
  "sqlite",
  "sqlserver",
  "starburst",
  "vertica",
] as const;

export const providerNames = [
  "Aiven",
  "Amazon RDS",
  "Azure",
  "Crunchy Data",
  "DigitalOcean",
  "Fly.io",
  "Neon",
  "PlanetScale",
  "Railway",
  "Render",
  "Scaleway",
  "Supabase",
  "Timescale",
] as const;

export type DatabaseProviderName = (typeof providerNames)[number];

export type DatabaseProvider = {
  name: DatabaseProviderName;
  pattern: string;
};

export type EngineKey = (typeof engineKeys)[number];

export type ContainerStyleType = "grid" | "component";
export type ContainerStyle = [ContainerStyleType, string];

export function isContainerStyle(value: unknown): value is ContainerStyle {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (value[0] === "grid" || value[0] === "component") &&
    typeof value[1] === "string"
  );
}

export interface DatabaseFieldGroup {
  type: "group";
  "container-style": unknown;
  fields: EngineField[];
}

export type DatabaseFieldOrGroup = EngineField | DatabaseFieldGroup;

export interface Engine {
  "driver-name": string;
  "details-fields"?: DatabaseFieldOrGroup[];
  source: EngineSource;
  "superseded-by": string | null;
  "creatable?"?: boolean;
  "extra-info": {
    "db-routing-info": {
      text: string;
    };
    providers?: DatabaseProvider[];
  } | null;
}

export interface EngineField {
  name: string;
  type?: EngineFieldType;
  "display-name"?: string;
  description?: string;
  "helper-text"?: string;
  placeholder?: unknown;
  required?: boolean;
  default?: unknown;
  options?: EngineFieldOption[];
  "visible-if"?: Record<string, unknown>;
  "treat-before-posting"?: EngineFieldTreatType;
}

export type EngineFieldType =
  | "string"
  | "password"
  | "text"
  | "integer"
  | "boolean"
  | "select"
  | "textFile"
  | "info"
  | "section"
  | "hidden";

export type EngineFieldTreatType = "base64";

export interface EngineFieldOption {
  name: string;
  value: string;
}

export interface EngineSource {
  type: "official" | "community";
  contact: EngineSourceContact | null;
}

export interface EngineSourceContact {
  name?: string;
  address?: string;
}

export interface ScheduleSettings {
  schedule_type: ScheduleType;
  schedule_day?: ScheduleDayType | null;
  schedule_frame?: ScheduleFrameType | null;
  schedule_hour?: number | null;
  schedule_minute?: number | null;
}

export type ScheduleType = "hourly" | "daily" | "weekly" | "monthly";

export type ScheduleDayType =
  | "sun"
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat";

export type ScheduleFrameType = "first" | "mid" | "last";

export type PasswordComplexity = {
  total?: number;
  digit?: number;
  upper?: number;
  lower?: number;
  special?: number;
};

export interface Version {
  tag?: string;
}
