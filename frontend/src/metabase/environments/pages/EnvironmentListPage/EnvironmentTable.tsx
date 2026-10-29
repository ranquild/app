import { t } from "ttag";

import { Card, Icon, Text } from "metabase/ui";
import { formatRelativeTime } from "metabase/utils/dates";
import type { Environment } from "metabase-types/api";

import { EnvironmentStatusBadge } from "../../components/EnvironmentStatusBadge";
import { getPort } from "../../utils";

import S from "./EnvironmentTable.module.css";

interface EnvironmentTableProps {
  environments: Environment[];
  onRowClick: (environment: Environment) => void;
}

export function EnvironmentTable({ environments, onRowClick }: EnvironmentTableProps) {
  return (
    <Card withBorder p={0} className={S.card}>
      <table className={S.table}>
        <thead>
          <tr>
            <th>{t`Name`}</th>
            <th>{t`Status`}</th>
            <th>{t`Metabase`}</th>
            <th>{t`Created`}</th>
            <th aria-label={t`Open`} />
          </tr>
        </thead>
        <tbody>
          {environments.map((environment) => (
            <tr
              key={environment.id}
              onClick={() => onRowClick(environment)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onRowClick(environment);
                }
              }}
              tabIndex={0}
              data-testid="environment-row"
            >
              <td>
                <Text className={S.branch}>{environment.name}</Text>
              </td>
              <td>
                <EnvironmentStatusBadge status={environment.status} />
              </td>
              <td>
                <Text className={S.mono} c="text-secondary">
                  {formatPorts(environment)}
                </Text>
              </td>
              <td>
                <Text c="text-secondary">{formatRelativeTime(environment.created_at)}</Text>
              </td>
              <td className={S.chevronCell}>
                <Icon name="chevronright" c="text-tertiary" size={12} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function formatPorts(environment: Environment): string {
  const port = environment.status === "running" ? getPort(environment.metabase_url) : null;
  return port ? `:${port}` : "—";
}
