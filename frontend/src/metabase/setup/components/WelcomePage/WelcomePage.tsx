import { t } from "ttag";

import { LogoIcon } from "metabase/common/components/LogoIcon";
import { Anchor, Box, Button, Flex, Stack, Text, Title } from "metabase/ui";

import { SETUP_GUIDE_URL } from "../../constants";

import S from "./WelcomePage.module.css";

interface WelcomePageProps {
  onStart: () => void;
}

export function WelcomePage({ onStart }: WelcomePageProps) {
  return (
    <Flex direction="column" h="100%" className={S.page}>
      <Stack align="center" justify="center" flex={1} gap="lg" px="md">
        <LogoIcon height={72} />
        <Title order={1} c="brand" fw={900} ta="center">
          {t`Welcome to App`}
        </Title>
        <Text c="text-secondary" fz="lg" ta="center" maw="32rem" lh="lg">
          {t`Looks like everything is working. Activate a license, connect a database and an AI provider, then spin up environments: a Metabase plus a pi agent you chat with.`}
        </Text>
        <Button variant="filled" size="lg" onClick={onStart} mt="md">
          {t`Let's get started`}
        </Button>
      </Stack>
      <Flex justify="center" pb="xxxl">
        <Box className={S.help}>
          <Text c="text-secondary" fz="sm">
            {t`If you get stuck,`}{" "}
            <Anchor href={SETUP_GUIDE_URL} target="_blank" fw={700}>
              {t`our setup guide`}
            </Anchor>{" "}
            {t`is just a click away.`}
          </Text>
        </Box>
      </Flex>
    </Flex>
  );
}
