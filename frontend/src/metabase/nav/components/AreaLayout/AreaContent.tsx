import { type ReactNode, memo } from "react";

import { Box } from "metabase/ui";

export const CONTENT_PADDING_X = "2rem";

type AreaContentProps = {
  children?: ReactNode;
};

export const AreaContent = memo(function AreaContent({
  children,
}: AreaContentProps) {
  return (
    <Box
      h="100%"
      px={CONTENT_PADDING_X}
      py="1.75rem"
      bg="background_page-secondary"
      style={{ overflowY: "auto" }}
    >
      {children}
    </Box>
  );
});
