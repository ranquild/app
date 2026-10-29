import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  getErrorMessage,
  useCreateEnvironmentMetabaseSessionMutation,
  useDeleteEnvironmentMutation,
  useGetEnvironmentCredentialsQuery,
  useGetEnvironmentQuery,
  useStartEnvironmentMutation,
  useStopEnvironmentMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ConversationPane } from "metabase/conversations/components/ConversationPane";
import { Link, useNavigate, useParams } from "metabase/router";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Center,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Environment, EnvironmentStatus } from "metabase-types/api";

import { EnvironmentStatusBadge } from "../../components/EnvironmentStatusBadge";
import { POLLING_INTERVAL_MS, getPort, isTransitioning } from "../../utils";

import S from "./EnvironmentDetailPage.module.css";

export function EnvironmentDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: environment, error, isLoading } = useGetEnvironmentQuery(id, { skip: !Number.isFinite(id) });
  const [awaitedStatus, setAwaitedStatus] = useState<EnvironmentStatus | null>(null);
  const isAwaiting =
    awaitedStatus != null && environment != null && ![awaitedStatus, "error"].includes(environment.status);
  useEffect(() => {
    if (awaitedStatus != null && !isAwaiting) {
      setAwaitedStatus(null);
    }
  }, [awaitedStatus, isAwaiting]);
  useGetEnvironmentQuery(id, {
    skip: !environment || !(isTransitioning(environment.status) || isAwaiting),
    pollingInterval: POLLING_INTERVAL_MS,
  });
  const [metabaseLocation, setMetabaseLocation] = useState<{ url: string; key: number } | null>(null);

  if (!environment) {
    return (
      <Box p="xl">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Box>
    );
  }

  return (
    <Flex direction="column" h="100%" className={S.page}>
      <EnvironmentHeader environment={environment} isAwaiting={isAwaiting} onAwait={setAwaitedStatus} />
      <Flex className={S.split} flex={1} mih={0}>
        <ConversationPane
          environment={environment}
          onOpenLink={(url) => {
            const base = environment.metabase_url;
            if (environment.status !== "running" || !base || !url.startsWith(base)) {
              return false;
            }
            setMetabaseLocation((current) => ({ url, key: (current?.key ?? 0) + 1 }));
            return true;
          }}
        />
        {environment.status === "running" && environment.metabase_url ? (
          <MetabasePane
            environment={environment}
            metabaseUrl={metabaseLocation?.url ?? environment.metabase_url}
            locationKey={metabaseLocation?.key ?? 0}
          />
        ) : (
          <Center flex={1} p="xl" className={S.metabasePane}>
            <EnvironmentStatusPlaceholder environment={environment} />
          </Center>
        )}
      </Flex>
    </Flex>
  );
}

interface EnvironmentHeaderProps {
  environment: Environment;
  isAwaiting: boolean;
  onAwait: (status: EnvironmentStatus) => void;
}

function EnvironmentHeader({ environment, isAwaiting, onAwait }: EnvironmentHeaderProps) {
  const navigate = useNavigate();
  const [startEnvironment, startState] = useStartEnvironmentMutation();
  const [stopEnvironment, stopState] = useStopEnvironmentMutation();
  const [isDeleteOpen, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const isRunning = environment.status === "running";
  const actionError = startState.error ?? stopState.error;
  const metabasePort = getPort(environment.metabase_url);

  return (
    <Flex className={S.header} align="center" justify="space-between" gap="md">
      <Group gap="sm" wrap="nowrap" miw={0}>
        <Tooltip label={t`Back to environments`}>
          <ActionIcon component={Link} to={Urls.environments()} aria-label={t`Back to environments`}>
            <Icon name="chevronleft" c="text-secondary" />
          </ActionIcon>
        </Tooltip>
        <Title order={4} className={S.name}>
          {environment.name}
        </Title>
        <EnvironmentStatusBadge status={environment.status} />
        {actionError && (
          <Text c="error" fz="sm" role="alert">
            {getErrorMessage(actionError)}
          </Text>
        )}
      </Group>
      <Group gap="sm" wrap="nowrap">
        {isRunning && metabasePort && environment.metabase_url && (
          <Tooltip label={t`Open in a new tab`}>
            <a className={S.portPill} href={environment.metabase_url} target="_blank" rel="noreferrer">
              metabase :{metabasePort}
            </a>
          </Tooltip>
        )}
        {isRunning ? (
          <Button
            variant="default"
            loading={stopState.isLoading || isAwaiting}
            onClick={() => {
              onAwait("stopped");
              stopEnvironment(environment.id);
            }}
          >
            {t`Stop`}
          </Button>
        ) : (
          <Button
            variant="filled"
            loading={startState.isLoading || isAwaiting}
            disabled={isTransitioning(environment.status)}
            onClick={() => {
              onAwait("running");
              startEnvironment(environment.id);
            }}
          >
            {t`Start`}
          </Button>
        )}
        <Tooltip label={t`Delete environment`}>
          <ActionIcon
            aria-label={t`Delete environment`}
            onClick={openDelete}
            disabled={environment.status === "deleting"}
          >
            <Icon name="trash" c="text-secondary" />
          </ActionIcon>
        </Tooltip>
      </Group>
      <DeleteEnvironmentModal
        environment={environment}
        opened={isDeleteOpen}
        onClose={closeDelete}
        onDeleted={() => navigate(Urls.environments())}
      />
    </Flex>
  );
}

interface MetabasePaneProps {
  environment: Environment;
  metabaseUrl: string;
  locationKey: number;
}

function MetabasePane({ environment, metabaseUrl, locationKey }: MetabasePaneProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [createSession, { isSuccess, isError }] = useCreateEnvironmentMetabaseSessionMutation();

  useEffect(() => {
    createSession(environment.id);
  }, [createSession, environment.id]);

  return (
    <Flex direction="column" className={S.metabasePane}>
      <Group gap="xs" className={S.metabasePaneHeader} wrap="nowrap">
        <Box className={S.dot} data-color="blue" />
        <Text fw={700} fz="sm" c="text-secondary">
          Metabase
        </Text>
        <Tooltip label={t`Reload Metabase`}>
          <ActionIcon aria-label={t`Reload Metabase`} size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            <Icon name="refresh" size={12} c="text-secondary" />
          </ActionIcon>
        </Tooltip>
        {isError && <MetabaseSignInHint environment={environment} />}
      </Group>
      {isSuccess || isError ? (
        <iframe key={`${locationKey}-${reloadKey}`} className={S.frame} src={metabaseUrl} title={t`Metabase`} />
      ) : (
        <Center flex={1}>
          <Loader />
        </Center>
      )}
    </Flex>
  );
}

function MetabaseSignInHint({ environment }: { environment: Environment }) {
  const { data: credentials } = useGetEnvironmentCredentialsQuery(environment.id);
  const [copied, setCopied] = useState(false);

  if (!credentials) {
    return null;
  }

  const copyPassword = async () => {
    await navigator.clipboard.writeText(credentials.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Group gap="xs" ml="auto" wrap="nowrap">
      <Text fz="sm" c="text-secondary">
        {t`Sign in as`} <code className={S.signInEmail}>{credentials.email}</code>
      </Text>
      <Button size="compact-sm" variant="subtle" onClick={copyPassword}>
        {copied ? t`Copied` : t`Copy password`}
      </Button>
    </Group>
  );
}

function EnvironmentStatusPlaceholder({ environment }: { environment: Environment }) {
  switch (environment.status) {
    case "creating":
      return (
        <Stack align="center" gap="sm">
          <Loader />
          <Title order={4}>{t`Starting your environment…`}</Title>
          <Text c="text-secondary" ta="center" maw="30rem">
            {t`The provisioner is starting Metabase with a fresh app database, then the pi agent. The first start takes a minute or two.`}
          </Text>
        </Stack>
      );
    case "deleting":
      return (
        <Stack align="center" gap="sm">
          <Loader />
          <Title order={4}>{t`Deleting this environment…`}</Title>
        </Stack>
      );
    case "error":
      return (
        <Alert color="error" title={t`Something went wrong with this environment`} maw="40rem">
          <Stack gap="sm">
            {environment.error_message && (
              <Text component="pre" fz="sm" className={S.errorMessage}>
                {environment.error_message}
              </Text>
            )}
            <Text fz="sm">{t`Check that Docker and the provisioner are running, then start it again.`}</Text>
          </Stack>
        </Alert>
      );
    default:
      return (
        <Stack align="center" gap="sm">
          <Icon name="pause" size={28} c="text-tertiary" />
          <Title order={4}>{t`This environment is stopped`}</Title>
          <Text c="text-secondary">{t`Start it to bring Metabase and the agent back up. Conversations are kept.`}</Text>
        </Stack>
      );
  }
}

interface DeleteEnvironmentModalProps {
  environment: Environment;
  opened: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteEnvironmentModal({ environment, opened, onClose, onDeleted }: DeleteEnvironmentModalProps) {
  const [deleteEnvironment, { isLoading, error }] = useDeleteEnvironmentMutation();

  const handleDelete = async () => {
    const result = await deleteEnvironment(environment.id);
    if (!("error" in result)) {
      onClose();
      onDeleted();
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t`Delete this environment?`} size="md" centered>
      <Text c="text-secondary">
        {t`This removes the containers of ${environment.name} and their data, and deletes its conversations.`}
      </Text>
      {error && (
        <Text c="error" mt="md" role="alert">
          {getErrorMessage(error)}
        </Text>
      )}
      <Group justify="flex-end" mt="xl" gap="sm">
        <Button variant="default" onClick={onClose}>
          {t`Cancel`}
        </Button>
        <Button variant="filled" color="negative" loading={isLoading} onClick={handleDelete}>
          {t`Delete`}
        </Button>
      </Group>
    </Modal>
  );
}
