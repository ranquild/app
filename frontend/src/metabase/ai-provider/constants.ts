import type { AiProviderName } from "metabase-types/api";

export interface AiProviderInfo {
  name: AiProviderName;
  displayName: string;
  /** Short mark shown in the provider tile. */
  monogram: string;
  keyPlaceholder: string;
  keyDocsUrl: string;
  defaultModel: string;
  models: string[];
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    name: "anthropic",
    displayName: "Anthropic",
    monogram: "A\\",
    keyPlaceholder: "sk-ant-api03-…",
    keyDocsUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-5-5",
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  },
  {
    name: "openai",
    displayName: "OpenAI",
    monogram: "O",
    keyPlaceholder: "sk-proj-…",
    keyDocsUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-5",
    models: ["gpt-5", "gpt-5-mini"],
  },
  {
    name: "openrouter",
    displayName: "OpenRouter",
    monogram: "OR",
    keyPlaceholder: "sk-or-v1-…",
    keyDocsUrl: "https://openrouter.ai/settings/keys",
    defaultModel: "anthropic/claude-sonnet-5",
    models: ["anthropic/claude-sonnet-5", "openai/gpt-5"],
  },
  {
    name: "mistral",
    displayName: "Mistral",
    monogram: "M",
    keyPlaceholder: "…",
    keyDocsUrl: "https://console.mistral.ai/api-keys",
    defaultModel: "mistral-large-latest",
    models: ["mistral-large-latest", "codestral-latest"],
  },
  {
    name: "deepseek",
    displayName: "DeepSeek",
    monogram: "DS",
    keyPlaceholder: "sk-…",
    keyDocsUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    name: "google",
    displayName: "Google Gemini Enterprise",
    monogram: "G",
    keyPlaceholder: "AIza…",
    keyDocsUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
];

export function getAiProvider(name: AiProviderName | null | undefined): AiProviderInfo {
  return AI_PROVIDERS.find((provider) => provider.name === name) ?? AI_PROVIDERS[0];
}
