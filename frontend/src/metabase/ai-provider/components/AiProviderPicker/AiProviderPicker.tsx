import cx from "classnames";

import { Box, Group, SimpleGrid, Text, UnstyledButton } from "metabase/ui";
import type { AiProviderName } from "metabase-types/api";

import { AI_PROVIDERS, type AiProviderInfo } from "../../constants";

import S from "./AiProviderPicker.module.css";

interface AiProviderPickerProps {
  value: AiProviderName;
  onChange: (value: AiProviderName) => void;
}

/** The 2-column grid of provider tiles. */
export function AiProviderPicker({ value, onChange }: AiProviderPickerProps) {
  return (
    <SimpleGrid cols={2} spacing="sm" role="radiogroup">
      {AI_PROVIDERS.map((provider) => (
        <UnstyledButton
          key={provider.name}
          role="radio"
          aria-checked={provider.name === value}
          className={cx(S.tile, { [S.selected]: provider.name === value })}
          onClick={() => onChange(provider.name)}
        >
          <AiProviderLabel provider={provider} />
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}

export function AiProviderLabel({ provider }: { provider: AiProviderInfo }) {
  return (
    <Group gap="md" wrap="nowrap">
      <Box className={S.monogram}>{provider.monogram}</Box>
      <Text fw={700}>{provider.displayName}</Text>
    </Group>
  );
}
