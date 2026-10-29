import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { getErrorMessage, useCreateEnvironmentMutation } from "metabase/api";
import { Button, Group, Modal, Text, TextInput } from "metabase/ui";
import type { Environment } from "metabase-types/api";

interface NewEnvironmentModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: (environment: Environment) => void;
}

export function NewEnvironmentModal({ opened, onClose, onCreated }: NewEnvironmentModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={t`New environment`} size="md" centered>
      {opened && <NewEnvironmentForm onCancel={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

interface NewEnvironmentFormProps {
  onCancel: () => void;
  onCreated: (environment: Environment) => void;
}

function NewEnvironmentForm({ onCancel, onCreated }: NewEnvironmentFormProps) {
  const [name, setName] = useState("");
  const [createEnvironment, { error, isLoading, reset }] = useCreateEnvironmentMutation();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await createEnvironment({ name: name.trim() });
    if ("data" in result && result.data) {
      onCreated(result.data);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Text c="text-secondary" mt={-8} mb="lg">
        {t`We'll start a Metabase with your databases, a fresh app database, and a pi agent logged in to it.`}
      </Text>
      <TextInput
        label={t`Name`}
        placeholder="sales-dashboards"
        value={name}
        onChange={(event) => {
          setName(event.currentTarget.value);
          reset();
        }}
        data-autofocus
        error={error ? getErrorMessage(error) : undefined}
        styles={{ input: { fontFamily: "var(--mb-default-monospace-font-family)" } }}
      />
      <Group justify="flex-end" mt="xl" gap="sm">
        <Button variant="default" onClick={onCancel}>
          {t`Cancel`}
        </Button>
        <Button type="submit" variant="filled" loading={isLoading} disabled={name.trim() === ""}>
          {t`Create environment`}
        </Button>
      </Group>
    </form>
  );
}
