import type { ReactNode } from "react";

import { Card, Stack } from "metabase/ui";

/** The white card admin settings forms sit in. */
export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <Card withBorder p="xl" maw="38rem">
      <Stack gap="md">{children}</Stack>
    </Card>
  );
}
