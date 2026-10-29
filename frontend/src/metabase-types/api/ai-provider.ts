export type AiProviderName =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "mistral"
  | "deepseek"
  | "google";

/** `GET/PUT /api/ai-provider/settings`. `api_key` comes back obfuscated. */
export interface AiProviderSettings {
  provider: AiProviderName | null;
  api_key: string | null;
  default_model: string | null;
}

export interface AiProviderTestRequest {
  provider: AiProviderName;
  api_key: string;
}

export interface AiProviderTestResponse {
  status?: "ok";
  models?: string[];
}
