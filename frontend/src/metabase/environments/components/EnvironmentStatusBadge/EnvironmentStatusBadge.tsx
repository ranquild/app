import { t } from "ttag";

import { Badge, type BadgeColor, Box, Group } from "metabase/ui";
import type { EnvironmentStatus } from "metabase-types/api";

import S from "./EnvironmentStatusBadge.module.css";

const STATUS_COLOR: Record<EnvironmentStatus, BadgeColor> = {
  creating: "brand",
  running: "positive",
  stopped: "neutral",
  error: "negative",
  deleting: "warning",
};

export function getStatusLabel(status: EnvironmentStatus): string {
  switch (status) {
    case "creating":
      return t`Starting`;
    case "running":
      return t`Running`;
    case "stopped":
      return t`Stopped`;
    case "error":
      return t`Error`;
    case "deleting":
      return t`Deleting`;
  }
}

interface EnvironmentStatusBadgeProps {
  status: EnvironmentStatus;
}

export function EnvironmentStatusBadge({ status }: EnvironmentStatusBadgeProps) {
  return (
    <Badge
      color={STATUS_COLOR[status]}
      variant="light"
      size="sm"
      data-status={status}
      className={S.badge}
    >
      <Group gap="xxs" wrap="nowrap">
        <Box className={S.dot} />
        {getStatusLabel(status)}
      </Group>
    </Badge>
  );
}
