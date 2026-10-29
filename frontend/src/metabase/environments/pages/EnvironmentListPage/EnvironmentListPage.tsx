import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { useListEnvironmentsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageHeader } from "metabase/common/components/PageHeader";
import { useNavigate } from "metabase/router";
import { Button, Card, Icon, Stack, Text, TextInput, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Environment } from "metabase-types/api";

import { NewEnvironmentModal } from "../../components/NewEnvironmentModal";
import { POLLING_INTERVAL_MS, isTransitioning } from "../../utils";

import { EnvironmentTable } from "./EnvironmentTable";

const SEARCH_DEBOUNCE_MS = 300;

export function EnvironmentListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false);

  const [pollingInterval, setPollingInterval] = useState(0);
  const { data, error, isLoading } = useListEnvironmentsQuery(
    debouncedSearch ? { search: debouncedSearch } : undefined,
    { pollingInterval },
  );
  const environments = data?.data ?? [];
  const nextPollingInterval = environments.some((ws) => isTransitioning(ws.status))
    ? POLLING_INTERVAL_MS
    : 0;
  if (nextPollingInterval !== pollingInterval) {
    setPollingInterval(nextPollingInterval);
  }

  const handleCreated = (environment: Environment) => {
    closeModal();
    navigate(Urls.environment(environment.id));
  };

  return (
    <>
      <PageHeader
        title={t`Environments`}
        actions={
          <>
            <TextInput
              aria-label={t`Search environments`}
              placeholder={t`Search environments…`}
              leftSection={<Icon name="search" />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              w="14rem"
            />
            <Button
              variant="filled"
              leftSection={<Icon name="add" />}
              onClick={openModal}
            >
              {t`New`}
            </Button>
          </>
        }
      />
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        {environments.length > 0 ? (
          <EnvironmentTable
            environments={environments}
            onRowClick={(environment) => navigate(Urls.environment(environment.id))}
          />
        ) : (
          <EmptyState
            isFiltered={debouncedSearch.length > 0}
            onCreate={openModal}
          />
        )}
      </LoadingAndErrorWrapper>
      <NewEnvironmentModal
        opened={isModalOpen}
        onClose={closeModal}
        onCreated={handleCreated}
      />
    </>
  );
}

function EmptyState({
  isFiltered,
  onCreate,
}: {
  isFiltered: boolean;
  onCreate: () => void;
}) {
  return (
    <Card withBorder p="xxxl">
      <Stack align="center" gap="sm">
        <Icon name="layout_grid" size={32} c="text-tertiary" />
        <Title order={4}>
          {isFiltered ? t`No environments match your search` : t`No environments yet`}
        </Title>
        <Text c="text-secondary" ta="center" maw="28rem">
          {isFiltered
            ? t`Try a different name.`
            : t`An environment is a Metabase and a pi agent you chat with, already logged in to it.`}
        </Text>
        {!isFiltered && (
          <Button variant="filled" mt="sm" leftSection={<Icon name="add" />} onClick={onCreate}>
            {t`Create your first environment`}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
