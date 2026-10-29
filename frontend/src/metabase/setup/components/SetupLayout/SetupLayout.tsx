import type { ReactNode } from "react";
import { t } from "ttag";

import { LogoIcon } from "metabase/common/components/LogoIcon";
import { ActionIcon, Box, Flex, Group, Icon, Text, Tooltip } from "metabase/ui";

import { SETUP_GUIDE_URL } from "../../constants";

import S from "./SetupLayout.module.css";

interface SetupLayoutProps {
  children: ReactNode;
  showLanguage?: boolean;
}

export function SetupLayout({ children, showLanguage = true }: SetupLayoutProps) {
  return (
    <Flex direction="column" mih="100%" className={S.page}>
      <Flex className={S.header} align="center" justify="center" pos="relative">
        <LogoIcon height={24} />
        {showLanguage && (
          <Group gap="md" className={S.headerRight}>
            <Text fw={700} c="text-secondary" fz="sm">
              {t`English`}
            </Text>
            <Tooltip label={t`Setup guide`}>
              <ActionIcon
                component="a"
                href={SETUP_GUIDE_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={t`Setup guide`}
              >
                <Icon name="info_outline" c="text-secondary" />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Flex>
      <Box className={S.content}>{children}</Box>
    </Flex>
  );
}
