import type { ReactNode } from "react";

import { Box, Flex, Text, Title } from "metabase/ui";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Flex align="flex-start" justify="space-between" gap="md" mb="lg">
      <Box>
        <Title order={2} fz="1.625rem" fw={900}>
          {title}
        </Title>
        {description && (
          <Text c="text-secondary" mt="xxs">
            {description}
          </Text>
        )}
      </Box>
      {actions && (
        <Flex gap="sm" align="center">
          {actions}
        </Flex>
      )}
    </Flex>
  );
}
