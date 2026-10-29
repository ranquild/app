import { type FormEvent, useState } from "react";
import { t } from "ttag";

import {
  getErrorMessage,
  useGetAiProviderSettingsQuery,
  useTestAiProviderConnectionMutation,
  useUpdateAiProviderSettingsMutation,
} from "metabase/api";
import {
  AiProviderLabel,
  AiProviderPicker,
} from "metabase/ai-provider/components/AiProviderPicker";
import { getAiProvider } from "metabase/ai-provider/constants";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageHeader } from "metabase/common/components/PageHeader";
import { StatusMessage } from "metabase/common/components/StatusMessage";
import { Badge, Button, Flex, Group, NativeSelect, PasswordInput } from "metabase/ui";
import type { AiProviderName, AiProviderSettings } from "metabase-types/api";

import { SettingsCard } from "../../components/SettingsCard/SettingsCard";

export function AiProviderSettingsPage() {
  const { data, error, isLoading } = useGetAiProviderSettingsQuery();

  return (
    <>
      <PageHeader title={t`AI provider`} description={t`Used by opencode inside every environment.`} />
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        {data && <AiProviderSettingsForm settings={data} />}
      </LoadingAndErrorWrapper>
    </>
  );
}

function AiProviderSettingsForm({ settings }: { settings: AiProviderSettings }) {
  const [providerName, setProviderName] = useState<AiProviderName>(settings.provider ?? "anthropic");
  const [isPicking, setIsPicking] = useState(false);
  const [apiKey, setApiKey] = useState(settings.api_key ?? "");
  const provider = getAiProvider(providerName);
  const [model, setModel] = useState(settings.default_model ?? provider.defaultModel);
  const [updateSettings, updateState] = useUpdateAiProviderSettingsMutation();
  const [testConnection, testState] = useTestAiProviderConnectionMutation();
  const isConnected = settings.api_key != null && settings.provider === providerName;
  const models = [...new Set([model, ...(testState.data?.models ?? provider.models)])];

  const handleProviderChange = (name: AiProviderName) => {
    setProviderName(name);
    setModel(getAiProvider(name).defaultModel);
    setApiKey(name === settings.provider ? (settings.api_key ?? "") : "");
    updateState.reset();
    testState.reset();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    updateSettings({ provider: providerName, api_key: apiKey, default_model: model });
  };

  return (
    <form onSubmit={handleSubmit}>
      <SettingsCard>
        {isPicking ? (
          <AiProviderPicker
            value={providerName}
            onChange={(name) => {
              handleProviderChange(name);
              setIsPicking(false);
            }}
          />
        ) : (
          <Flex justify="space-between" align="center">
            <AiProviderLabel provider={provider} />
            {isConnected && (
              <Badge color="positive" variant="light" size="sm" tt="none">
                {t`Connected`}
              </Badge>
            )}
          </Flex>
        )}
        <NativeSelect
          label={t`Default model`}
          data={models}
          value={model}
          onChange={(event) => setModel(event.currentTarget.value)}
        />
        <PasswordInput
          label={t`API key`}
          placeholder={provider.keyPlaceholder}
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.currentTarget.value);
            updateState.reset();
            testState.reset();
          }}
        />
        {updateState.isSuccess && <StatusMessage status="success" message={t`Changes saved`} />}
        {testState.isSuccess && <StatusMessage status="success" message={t`API key works`} />}
        {(updateState.error ?? testState.error) && (
          <StatusMessage status="error" message={getErrorMessage(updateState.error ?? testState.error)} />
        )}
        <Group gap="sm">
          <Button type="submit" variant="filled" loading={updateState.isLoading} disabled={apiKey === ""}>
            {t`Save changes`}
          </Button>
          <Button
            variant="default"
            loading={testState.isLoading}
            disabled={apiKey === ""}
            onClick={() => testConnection({ provider: providerName, api_key: apiKey })}
          >
            {t`Test connection`}
          </Button>
          <Button variant="default" onClick={() => setIsPicking(!isPicking)}>
            {t`Change provider`}
          </Button>
        </Group>
      </SettingsCard>
    </form>
  );
}
