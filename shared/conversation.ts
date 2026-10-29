import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { FileEntry, JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";

export type { AgentMessage, FileEntry, JsonAgentSessionEvent };

export type ToolRun = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  output: string;
  isError: boolean;
  done: boolean;
};

export type ConversationView = {
  messages: AgentMessage[];
  streaming: AgentMessage | null;
  running: boolean;
  tools: Record<string, ToolRun>;
  error: string | null;
};

export type ConversationStreamEvent =
  | { kind: "snapshot"; seq: number; view: ConversationView }
  | { kind: "event"; seq: number; event: JsonAgentSessionEvent };

export function createView(messages: AgentMessage[], running = false): ConversationView {
  return { messages, streaming: null, running, tools: {}, error: null };
}

export function isVisibleMessage(message: AgentMessage): boolean {
  return "role" in message && (message.role === "user" || message.role === "assistant" || message.role === "toolResult");
}

export function messagesFromEntries(entries: FileEntry[]): AgentMessage[] {
  return entries.flatMap((entry) =>
    entry.type === "message" && isVisibleMessage(entry.message) ? [entry.message] : [],
  );
}

export function textOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => (block && typeof block === "object" && block.type === "text" ? String(block.text ?? "") : ""))
    .join("");
}

type AssistantUpdate = Extract<JsonAgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"];

type Block = Record<string, unknown>;

function applyAssistantUpdate(message: AgentMessage, update: AssistantUpdate): AgentMessage {
  if (!("role" in message) || message.role !== "assistant") {
    return message;
  }
  const content = [...(message.content as unknown as Block[])];
  const at = "contentIndex" in update ? update.contentIndex : -1;
  const current = (content[at] ?? {}) as Block;
  switch (update.type) {
    case "text_start":
      content[at] = { type: "text", text: "" };
      break;
    case "text_delta":
      content[at] = { ...current, type: "text", text: String(current.text ?? "") + update.delta };
      break;
    case "text_end":
      content[at] = { ...current, type: "text", text: update.content };
      break;
    case "thinking_start":
      content[at] = { type: "thinking", thinking: "" };
      break;
    case "thinking_delta":
      content[at] = { ...current, type: "thinking", thinking: String(current.thinking ?? "") + update.delta };
      break;
    case "thinking_end":
      content[at] = { ...current, type: "thinking", thinking: update.content };
      break;
    case "toolcall_start":
      content[at] = { type: "toolCall", id: update.id, name: update.toolName, arguments: {} };
      break;
    case "toolcall_end":
      content[at] = update.toolCall as unknown as Block;
      break;
    default:
      return message;
  }
  return { ...message, content } as unknown as AgentMessage;
}

export function applyEvent(view: ConversationView, event: JsonAgentSessionEvent): ConversationView {
  switch (event.type) {
    case "agent_start":
      return { ...view, running: true, error: null };
    case "agent_settled":
      return { ...view, running: false, streaming: null };
    case "message_start":
      return "role" in event.message && event.message.role === "assistant"
        ? { ...view, streaming: event.message }
        : view;
    case "message_update":
      return view.streaming
        ? { ...view, streaming: applyAssistantUpdate(view.streaming, event.assistantMessageEvent) }
        : view;
    case "message_end": {
      const isAssistant = "role" in event.message && event.message.role === "assistant";
      const messages = isVisibleMessage(event.message) ? [...view.messages, event.message] : view.messages;
      const error =
        isAssistant && "errorMessage" in event.message && event.message.errorMessage
          ? event.message.errorMessage
          : view.error;
      return { ...view, messages, streaming: isAssistant ? null : view.streaming, error };
    }
    case "tool_execution_start":
      return {
        ...view,
        tools: {
          ...view.tools,
          [event.toolCallId]: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
            output: "",
            isError: false,
            done: false,
          },
        },
      };
    case "tool_execution_update": {
      const tool = view.tools[event.toolCallId];
      return tool
        ? { ...view, tools: { ...view.tools, [event.toolCallId]: { ...tool, output: textOf(event.partialResult?.content) } } }
        : view;
    }
    case "tool_execution_end": {
      const tool = view.tools[event.toolCallId];
      return tool
        ? {
            ...view,
            tools: {
              ...view.tools,
              [event.toolCallId]: { ...tool, output: textOf(event.result?.content), isError: event.isError, done: true },
            },
          }
        : view;
    }
    default:
      return view;
  }
}
