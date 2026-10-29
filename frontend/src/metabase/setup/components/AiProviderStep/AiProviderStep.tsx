import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { getErrorMessage, useSetupAiProviderMutation } from "metabase/api";
import { AiProviderPicker } from "metabase/ai-provider/components/AiProviderPicker";
import { getAiProvider } from "metabase/ai-provider/constants";
import { Anchor, Button, Group, PasswordInput, Stack } from "metabase/ui";
import type { AiProviderName } from "metabase-types/api";

interface AiProviderStepProps {
  onDone: (provider: AiProviderName) => void;
}

export function AiProviderStep({ onDone }: AiProviderStepProps) {
  const [providerName, setProviderName] = useState<AiProviderName>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [setupAiProvider, { error, isLoading }] = useSetupAiProviderMutation();
  const provider = getAiProvider(providerName);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await setupAiProvider({
      provider: providerName,
      api_key: apiKey.trim(),
      default_model: provider.defaultModel,
    });
    if (!("error" in result)) {
      onDone(providerName);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <AiProviderPicker value={providerName} onChange={setProviderName} />
        <PasswordInput
          label={t`API key`}
          placeholder={provider.keyPlaceholder}
          value={apiKey}
          onChange={(event) => setApiKey(event.currentTarget.value)}
          error={error ? getErrorMessage(error) : undefined}
        />
        <Anchor href={provider.keyDocsUrl} target="_blank" fw={700} fz="sm">
          {t`Where do I find this?`}
        </Anchor>
        <Group gap="md">
          <Button type="submit" variant="filled" loading={isLoading} disabled={apiKey.trim() === ""}>
            {t`Connect`}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
