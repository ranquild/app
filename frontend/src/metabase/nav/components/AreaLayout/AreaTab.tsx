import cx from "classnames";
import type { ReactNode } from "react";

import { Link } from "metabase/router";
import { Box, FixedSizeIcon, Flex, type IconName, Text, Tooltip } from "metabase/ui";

import S from "./AreaLayout.module.css";
import { TOOLTIP_OPEN_DELAY } from "./constants";

type AreaTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected?: boolean;
  showLabel: boolean;
  rightSection?: ReactNode;
  onClick?: () => void;
};

export function AreaTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
  rightSection,
  onClick,
}: AreaTabProps) {
  return (
    <Tooltip
      label={label}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
      disabled={showLabel}
    >
      <Flex
        className={cx(S.tab, { [S.selected]: isSelected })}
        component={Link}
        to={to}
        onClick={onClick}
        p="sm"
        gap="sm"
        bdrs="sm"
        aria-label={label}
        aria-current={isSelected ? "page" : undefined}
        justify={showLabel ? "start" : "center"}
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && (
          <Text lh="sm" c="inherit" fw="inherit">
            {label}
          </Text>
        )}
        {rightSection && <Box ml={showLabel ? "auto" : undefined}>{rightSection}</Box>}
      </Flex>
    </Tooltip>
  );
}
