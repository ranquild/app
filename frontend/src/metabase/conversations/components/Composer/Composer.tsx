import { type FormEvent, type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import { Button, Group, Textarea } from "metabase/ui";

import S from "./Composer.module.css";

interface ComposerProps {
  isRunning: boolean;
  isSending: boolean;
  disabled: boolean;
  onSend: (message: string) => Promise<boolean>;
  onStop: () => void;
}

export function Composer({ isRunning, isSending, disabled, onSend, onStop }: ComposerProps) {
  const [message, setMessage] = useState("");
  const canSend = !disabled && !isRunning && !isSending && message.trim() !== "";

  const send = async () => {
    if (!canSend) {
      return;
    }
    if (await onSend(message.trim())) {
      setMessage("");
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form onSubmit={handleSubmit} className={S.composer}>
      <Textarea
        aria-label={t`Message`}
        placeholder={disabled ? t`Start the environment to chat` : t`Message the agent…`}
        value={message}
        onChange={(event) => setMessage(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        autosize
        minRows={2}
        maxRows={10}
        disabled={disabled}
      />
      <Group justify="flex-end" mt="xs" gap="sm">
        {isRunning ? (
          <Button variant="default" onClick={onStop}>
            {t`Stop`}
          </Button>
        ) : (
          <Button type="submit" variant="filled" loading={isSending} disabled={!canSend}>
            {t`Send`}
          </Button>
        )}
      </Group>
    </form>
  );
}
