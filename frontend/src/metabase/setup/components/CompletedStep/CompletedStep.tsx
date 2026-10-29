import { t } from "ttag";

import { Box, Button, Card, Flex, Icon, SimpleGrid, Text, Title } from "metabase/ui";

import S from "./CompletedStep.module.css";

interface CompletedStepProps {
  isLicenseActive: boolean;
  isDatabaseConnected: boolean;
  aiProvider: string | null;
  onFinish: () => void;
}

export function CompletedStep({ isLicenseActive, isDatabaseConnected, aiProvider, onFinish }: CompletedStepProps) {
  return (
    <Box maw="38rem" mx="auto" mt="15vh">
      <Card withBorder mb="md">
        <Flex align="center" gap="md">
          <Box className={S.doneBadge}>
            <Icon name="check" size={12} />
          </Box>
          <Text fw={700} c="success" fz="md">
            {t`Setup complete`}
          </Text>
        </Flex>
      </Card>
      <Card withBorder p="xl">
        <Title order={3} fw={900}>
          {t`You're all set!`}
        </Title>
        <Text c="text-secondary" mt="xxs">
          {t`Create your first environment to get started.`}
        </Text>
        <SimpleGrid cols={3} spacing="sm" mt="lg">
          <SummaryTile label={t`License`} value={isLicenseActive ? t`Active` : t`Not active`} />
          <SummaryTile label={t`Database`} value={isDatabaseConnected ? t`Connected` : t`Not connected`} />
          <SummaryTile label={t`AI provider`} value={aiProvider ?? t`Not connected`} />
        </SimpleGrid>
        <Button variant="filled" mt="xl" onClick={onFinish} w="fit-content">
          {t`Take me to my environments`}
        </Button>
      </Card>
    </Box>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Box className={S.tile}>
      <Text c="text-secondary" fz="sm">
        {label}
      </Text>
      <Text fw={700} truncate>
        {value}
      </Text>
    </Box>
  );
}
