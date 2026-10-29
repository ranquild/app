import { type AnchorHTMLAttributes, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Markdown } from "metabase/common/components/Markdown";
import { Alert, Box, Group, Icon, Loader, Stack, Text, UnstyledButton } from "metabase/ui";
import { type AgentMessage, type ConversationView, type ToolRun, textOf } from "shared/conversation";

import S from "./MessageList.module.css";

type Block = { type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: unknown };

type ToolResult = { output: string; isError: boolean };

interface MessageListProps {
  view: ConversationView;
  onOpenLink?: (url: string) => boolean;
}

export function MessageList({ view, onOpenLink }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => getToolResults(view.messages), [view.messages]);
  const messages = view.streaming ? [...view.messages, view.streaming] : view.messages;

  useEffect(() => {
    const frame = requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(frame);
  }, [messages.length, view.streaming, view.tools]);

  return (
    <Stack gap="md" className={S.list}>
      {messages.length === 0 && (
        <Text c="text-secondary" ta="center" mt="xl">
          {t`Ask the agent to build something in this environment's Metabase, e.g. a dashboard for one of your databases.`}
        </Text>
      )}
      {messages.map((message, index) => (
        <MessageItem
          key={index}
          message={message}
          results={results}
          tools={view.tools}
          isStreaming={message === view.streaming}
          onOpenLink={onOpenLink}
        />
      ))}
      {view.running && !view.streaming && (
        <Group gap="xs" c="text-secondary">
          <Loader size="xs" />
          <Text fz="sm" c="text-secondary">{t`Working…`}</Text>
        </Group>
      )}
      {view.error && (
        <Alert color="error" title={t`The agent stopped with an error`}>
          <Text fz="sm" className={S.pre}>
            {view.error}
          </Text>
        </Alert>
      )}
      <div ref={endRef} />
    </Stack>
  );
}

function getToolResults(messages: AgentMessage[]): Record<string, ToolResult> {
  const results: Record<string, ToolResult> = {};
  for (const message of messages) {
    if ("role" in message && message.role === "toolResult") {
      results[message.toolCallId] = { output: textOf(message.content), isError: message.isError };
    }
  }
  return results;
}

interface MessageItemProps {
  message: AgentMessage;
  results: Record<string, ToolResult>;
  tools: Record<string, ToolRun>;
  isStreaming: boolean;
  onOpenLink?: (url: string) => boolean;
}

function MessageItem({ message, results, tools, isStreaming, onOpenLink }: MessageItemProps) {
  const components = useMemo(
    () => ({
      a: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            if (href && onOpenLink?.(href)) {
              event.preventDefault();
            }
          }}
        >
          {children}
        </a>
      ),
    }),
    [onOpenLink],
  );

  if (!("role" in message)) {
    return null;
  }
  if (message.role === "user") {
    return (
      <Box className={S.user} data-testid="user-message">
        <Text className={S.pre}>{textOf(message.content)}</Text>
      </Box>
    );
  }
  if (message.role !== "assistant") {
    return null;
  }
  const blocks = message.content as unknown as Block[];
  return (
    <Stack gap="xs" className={S.assistant} data-testid="assistant-message">
      {blocks.map((block, index) => {
        if (block.type === "text" && block.text) {
          return (
            <Markdown key={index} className={S.markdown} components={components}>
              {block.text}
            </Markdown>
          );
        }
        if (block.type === "thinking" && block.thinking) {
          return <Thinking key={index} text={block.thinking} />;
        }
        if (block.type === "toolCall" && block.id) {
          return (
            <ToolCard
              key={index}
              name={block.name ?? ""}
              args={block.arguments ?? tools[block.id]?.args}
              result={results[block.id]}
              run={tools[block.id]}
            />
          );
        }
        return null;
      })}
      {isStreaming && blocks.length === 0 && <Loader size="xs" />}
      {"errorMessage" in message && message.errorMessage && !isStreaming && (
        <Text c="error" fz="sm">
          {message.errorMessage}
        </Text>
      )}
    </Stack>
  );
}

function Thinking({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Box>
      <UnstyledButton onClick={() => setIsOpen(!isOpen)} className={S.toggle}>
        <Group gap="xxs">
          <Icon name={isOpen ? "chevrondown" : "chevronright"} size={10} />
          <Text fz="sm" c="text-secondary">{t`Thinking`}</Text>
        </Group>
      </UnstyledButton>
      {isOpen && (
        <Text fz="sm" c="text-secondary" className={S.pre}>
          {text}
        </Text>
      )}
    </Box>
  );
}

export function summarizeTool(name: string, args: unknown): string {
  const values = (args ?? {}) as Record<string, unknown>;
  if (name === "bash" && typeof values.command === "string") {
    return values.command;
  }
  const path = values.path ?? values.file_path;
  if (typeof path === "string") {
    return path;
  }
  const json = JSON.stringify(values);
  return json === "{}" ? "" : json;
}

interface ToolCardProps {
  name: string;
  args: unknown;
  result: ToolResult | undefined;
  run: ToolRun | undefined;
}

function ToolCard({ name, args, result, run }: ToolCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDone = result != null || run?.done === true;
  const isError = result?.isError ?? run?.isError ?? false;
  const output = result?.output ?? run?.output ?? "";
  const summary = summarizeTool(name, args);

  return (
    <Box className={S.tool} data-error={isError || undefined} data-testid="tool-call">
      <UnstyledButton onClick={() => setIsOpen(!isOpen)} className={S.toolHeader}>
        <Group gap="xs" wrap="nowrap" miw={0}>
          <Box className={S.statusIcon}>
            {isDone ? (
              <Icon name={isError ? "warning" : "check"} size={12} c={isError ? "error" : "success"} />
            ) : (
              <Loader size={12} />
            )}
          </Box>
          <Text fw={700} fz="sm" className={S.toolName}>
            {name}
          </Text>
          <Text fz="sm" c="text-secondary" truncate className={S.mono}>
            {summary}
          </Text>
        </Group>
      </UnstyledButton>
      {isOpen && (
        <Box className={S.toolBody}>
          {name !== "bash" && summary !== "" && <pre className={S.code}>{JSON.stringify(args, null, 2)}</pre>}
          {name === "bash" && <pre className={S.code}>$ {summary}</pre>}
          {output !== "" && <pre className={S.code}>{output}</pre>}
        </Box>
      )}
    </Box>
  );
}
