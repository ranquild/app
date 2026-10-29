import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageHeader } from "metabase/common/components/PageHeader";
import { Link, useNavigate } from "metabase/router";
import { Badge, Button, Card, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database } from "metabase-types/api";

import S from "./DatabaseListPage.module.css";

const ENGINE_NAMES: Record<string, string> = {
  postgres: "PostgreSQL",
  h2: "H2",
};

export function getEngineName(engine: string) {
  return ENGINE_NAMES[engine] ?? engine;
}

export function getDatabaseHost(database: Database): string {
  const { host, port } = database.details;
  if (!host) {
    return "—";
  }
  return port ? `${host}:${port}` : String(host);
}

export function DatabaseListPage() {
  const navigate = useNavigate();
  const { data, error, isLoading } = useListDatabasesQuery();
  const databases = data?.data ?? [];

  return (
    <>
      <PageHeader
        title={t`Databases`}
        description={t`Databases every environment's Metabase connects to.`}
        actions={
          <Button
            component={Link}
            to={Urls.adminNewDatabase()}
            variant="filled"
            leftSection={<Icon name="add" />}
          >
            {t`New`}
          </Button>
        }
      />
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        {databases.length === 0 ? (
          <Card withBorder p="xxxl">
            <Stack align="center" gap="sm">
              <Icon name="database" size={32} c="text-tertiary" />
              <Text fw={700}>{t`No databases yet`}</Text>
              <Text c="text-secondary">{t`Every environment's Metabase is connected to the databases you add here.`}</Text>
            </Stack>
          </Card>
        ) : (
          <Card withBorder p={0} className={S.card}>
            <table className={S.table}>
              <thead>
                <tr>
                  <th>{t`Name`}</th>
                  <th>{t`Engine`}</th>
                  <th>{t`Host`}</th>
                  <th>{t`Status`}</th>
                </tr>
              </thead>
              <tbody>
                {databases.map((database) => (
                  <tr
                    key={database.id}
                    tabIndex={0}
                    onClick={() => navigate(Urls.adminDatabase(database.id))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        navigate(Urls.adminDatabase(database.id));
                      }
                    }}
                  >
                    <td>
                      <Text fw={700}>{database.name}</Text>
                    </td>
                    <td>
                      <Text c="text-secondary">{getEngineName(database.engine)}</Text>
                    </td>
                    <td>
                      <Text c="text-secondary" className={S.mono}>
                        {getDatabaseHost(database)}
                      </Text>
                    </td>
                    <td>
                      <Badge color="positive" variant="light" size="sm" tt="none">
                        {t`Active`}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </LoadingAndErrorWrapper>
    </>
  );
}
