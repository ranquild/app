import type { EnvironmentId } from "./environment";

export type ConversationId = string;

export type ConversationState = "idle" | "running";

export interface Conversation {
  id: ConversationId;
  environment_id: EnvironmentId;
  title: string | null;
  state: ConversationState;
  created_at: string;
  updated_at: string;
}

export interface CreateConversationRequest {
  environment_id: EnvironmentId;
}

export interface PromptConversationRequest {
  id: ConversationId;
  message: string;
}
