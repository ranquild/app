import type { ReactNode } from "react";

import { Box, Card, Flex, Icon, Text, Title } from "metabase/ui";

import S from "./SetupStep.module.css";

export type SetupStepState = "active" | "done" | "pending";

interface SetupStepProps {
  number: number;
  title: string;
  description?: string;
  /** Shown instead of the title once the step is done, e.g. "Git repository connected". */
  doneTitle: string;
  state: SetupStepState;
  children?: ReactNode;
}

/** One card of the setup accordion: collapsed and dimmed until it's reached, collapsed with a check once done. */
export function SetupStep({
  number,
  title,
  description,
  doneTitle,
  state,
  children,
}: SetupStepProps) {
  if (state === "done") {
    return (
      <Card withBorder className={S.card} data-testid="setup-step" data-state="done">
        <Flex align="center" gap="md">
          <Box className={S.doneBadge}>
            <Icon name="check" size={12} />
          </Box>
          <Text fw={700} c="success" fz="md">
            {doneTitle}
          </Text>
        </Flex>
      </Card>
    );
  }

  if (state === "pending") {
    return (
      <Card withBorder className={S.pending} data-testid="setup-step" data-state="pending">
        <Flex align="center" gap="md">
          <Box className={S.number} data-pending>
            {number}
          </Box>
          <Text fw={700} c="text-disabled" fz="md">
            {title}
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Card withBorder className={S.card} data-testid="setup-step" data-state="active" p="xl">
      <Flex gap="md" align="flex-start">
        <Box className={S.number}>{number}</Box>
        <Box flex={1} miw={0}>
          <Title order={3} c="brand" fw={900}>
            {title}
          </Title>
          {description && (
            <Text c="text-secondary" mt="xxs">
              {description}
            </Text>
          )}
          <Box mt="lg">{children}</Box>
        </Box>
      </Flex>
    </Card>
  );
}
