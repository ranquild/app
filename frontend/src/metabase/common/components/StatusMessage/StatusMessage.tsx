import { FixedSizeIcon, Flex, Text } from "metabase/ui";

interface StatusMessageProps {
  status: "success" | "error";
  message: string;
}

/** A one-line inline result, like "✓ Connection successful" under a form. */
export function StatusMessage({ status, message }: StatusMessageProps) {
  const color = status === "success" ? "success" : "error";

  return (
    <Flex
      gap="sm"
      align="center"
      role={status === "error" ? "alert" : "status"}
      data-testid="status-message"
    >
      <FixedSizeIcon name={status === "success" ? "check" : "warning"} c={color} size={14} />
      <Text c={color} fw={700} fz="sm">
        {message}
      </Text>
    </Flex>
  );
}
