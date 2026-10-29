import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  getErrorMessage,
  useAbortConversationMutation,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useListConversationsQuery,
  usePromptConversationMutation,
} from "metabase/api";
import { ActionIcon, Box, Center, Flex, Group, Icon, Loader, Select, Text, Tooltip } from "metabase/ui";
import type { Conversation, Environment } from "metabase-types/api";

import { useConversationStream } from "../../hooks";
import { Composer } from "../Composer";
import { MessageList } from "../MessageList";

import S from "./ConversationPane.module.css";

interface ConversationPaneProps {
  environment: Environment;
  onOpenLink?: (url: string) => boolean;
}

function conversationLabel(conversation: Conversation) {
  return conversation.title ?? t`New conversation`;
}

export function ConversationPane({ environment, onOpenLink }: ConversationPaneProps) {
  const { data } = useListConversationsQuery(environment.id);
  const conversations = data?.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createConversation, createState] = useCreateConversationMutation();
  const [deleteConversation] = useDeleteConversationMutation();
  const [promptConversation, promptState] = usePromptConversationMutation();
  const [abortConversation] = useAbortConversationMutation();
  const isRunning = environment.status === "running";

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0] ?? null;
  const { view, isConnected } = useConversationStream(selected?.id ?? null);

  useEffect(() => {
    if (selectedId != null && data && !conversations.some((conversation) => conversation.id === selectedId)) {
      setSelectedId(null);
    }
  }, [conversations, data, selectedId]);

  const handleNew = async () => {
    const result = await createConversation({ environment_id: environment.id });
    if ("data" in result && result.data) {
      setSelectedId(result.data.id);
    }
  };

  const handleSend = async (message: string) => {
    let conversationId = selected?.id ?? null;
    if (!conversationId) {
      const created = await createConversation({ environment_id: environment.id });
      if (!("data" in created) || !created.data) {
        return false;
      }
      conversationId = created.data.id;
      setSelectedId(conversationId);
    }
    const result = await promptConversation({ id: conversationId, message });
    return !("error" in result);
  };

  const handleDelete = async () => {
    if (selected) {
      await deleteConversation(selected.id);
      setSelectedId(null);
    }
  };

  const sendError = promptState.error ?? createState.error;

  return (
    <Flex direction="column" className={S.pane}>
      <Group gap="xs" className={S.header} wrap="nowrap">
        <Icon name="ai" c="brand" />
        <Select
          aria-label={t`Conversation`}
          data={conversations.map((conversation) => ({ value: conversation.id, label: conversationLabel(conversation) }))}
          value={selected?.id ?? null}
          onChange={(value) => setSelectedId(value)}
          placeholder={t`No conversations yet`}
          size="xs"
          flex={1}
          allowDeselect={false}
        />
        <Tooltip label={t`New conversation`}>
          <ActionIcon aria-label={t`New conversation`} onClick={handleNew} loading={createState.isLoading}>
            <Icon name="add" c="text-secondary" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Delete conversation`}>
          <ActionIcon aria-label={t`Delete conversation`} onClick={handleDelete} disabled={!selected}>
            <Icon name="trash" c="text-secondary" />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Box className={S.body}>
        {selected == null ? (
          <Center h="100%" p="xl">
            <Text c="text-secondary" ta="center" maw="24rem">
              {t`Ask the agent to build something in this environment's Metabase, e.g. a dashboard for one of your databases.`}
            </Text>
          </Center>
        ) : view == null ? (
          <Center h="100%">
            <Loader />
          </Center>
        ) : (
          <MessageList view={view} onOpenLink={onOpenLink} />
        )}
      </Box>
      {sendError && (
        <Text c="error" fz="sm" px="lg" pt="xs" role="alert">
          {getErrorMessage(sendError)}
        </Text>
      )}
      {selected != null && view != null && !isConnected && (
        <Text c="text-secondary" fz="xs" px="lg" pt="xs">
          {t`Reconnecting…`}
        </Text>
      )}
      <Composer
        isRunning={view?.running ?? false}
        isSending={promptState.isLoading || createState.isLoading}
        disabled={!isRunning}
        onSend={handleSend}
        onStop={() => selected && abortConversation(selected.id)}
      />
    </Flex>
  );
}
