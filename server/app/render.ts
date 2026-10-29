import type { EnvironmentSpec } from "../../shared/protocol.ts";

import type { DatabaseRow, EnvironmentRow } from "./db.ts";

export type AiProviderName = "anthropic" | "openai" | "openrouter" | "mistral" | "deepseek" | "google";

export type AiSettings = {
  provider: AiProviderName;
  apiKey: string;
  model: string;
};

export type LicenseSettings = {
  token: string;
  valid: boolean;
  plan: string | null;
  expiresAt: string | null;
};

export const PROVIDER_HOSTS: Record<AiProviderName, string[]> = {
  anthropic: ["api.anthropic.com"],
  openai: ["api.openai.com"],
  openrouter: ["openrouter.ai"],
  mistral: ["api.mistral.ai"],
  deepseek: ["api.deepseek.com"],
  google: ["generativelanguage.googleapis.com"],
};

export type RenderInput = {
  environment: EnvironmentRow;
  license: LicenseSettings;
  ai: AiSettings;
  databases: DatabaseRow[];
  appOrigins: string[];
};

export function metabaseConfig(input: RenderInput): string {
  const { credentials } = input.environment;
  return JSON.stringify({
    version: 1,
    config: {
      settings: {
        "site-name": input.environment.name,
      },
      users: [
        {
          first_name: "App",
          last_name: "Admin",
          email: credentials.email,
          password: credentials.password,
        },
      ],
      "api-keys": [
        {
          name: "agent",
          group: "admin",
          creator: credentials.email,
          key: credentials.apiKey,
        },
      ],
      databases: input.databases.map((database) => ({
        name: database.name,
        engine: database.engine,
        details: database.details,
      })),
    },
  });
}

export function renderEnvironment(input: RenderInput): EnvironmentSpec {
  const { credentials } = input.environment;
  return {
    metabase: {
      env: {
        MB_CHECK_FOR_UPDATES: "false",
        MB_ANON_TRACKING_ENABLED: "false",
        MB_LOAD_SAMPLE_CONTENT: "false",
        MB_INSTALL_ANALYTICS_DATABASE: "false",
        MB_LOAD_ANALYTICS_CONTENT: "false",
        MB_ENABLE_EMBEDDING_INTERACTIVE: "true",
        MB_EMBEDDING_APP_ORIGINS_INTERACTIVE: input.appOrigins.join(" "),
        MB_SESSION_COOKIE_SAMESITE: "lax",
      },
      secrets: {
        MB_CONFIG_YML: metabaseConfig(input),
        MB_PREMIUM_EMBEDDING_TOKEN: input.license.token,
      },
    },
    agent: {
      env: {
        PI_PROVIDER: input.ai.provider,
        PI_MODEL: input.ai.model,
      },
      secrets: {
        PI_API_KEY: input.ai.apiKey,
        MB_API_KEY: credentials.apiKey,
        AGENT_TOKEN: credentials.agentToken,
      },
      egress: PROVIDER_HOSTS[input.ai.provider],
    },
  };
}
