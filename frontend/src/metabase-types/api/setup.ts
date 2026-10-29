import type { AiProviderName } from "./ai-provider";

export interface SetupStatus {
  "license_valid?": boolean;
  "ai_configured?": boolean;
  "setup_complete?": boolean;
  summary?: SetupSummary;
}

export interface SetupSummary {
  ai_provider: AiProviderName | null;
  ai_default_model: string | null;
  license_plan: string | null;
}

export interface SetupLicenseRequest {
  license_token: string;
}

export interface SetupAiProviderRequest {
  provider: AiProviderName;
  api_key: string;
  default_model?: string;
}

export interface StatusResponse {
  status: "ok";
}
