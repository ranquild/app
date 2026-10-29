import { t } from "ttag";

import { FormTextInput } from "metabase/forms";
import { Icon, Tooltip } from "metabase/ui";
import type { Engine } from "metabase-types/api";

import { getSharedFieldStyleProps } from "../styles";

export interface DatabaseNameFieldProps {
  engine: Engine;
  autoFocus?: boolean;
}

export const DatabaseNameField = ({
  engine,
  autoFocus,
  ...props
}: DatabaseNameFieldProps): JSX.Element => {
  const name = engine["driver-name"] ?? t`Database`;
  const autoFocusProps = autoFocus
    ? { autoFocus: true, "data-autofocus": true }
    : {};

  return (
    <FormTextInput
      name="name"
      label={t`Display name`}
      placeholder={t`Our ${name}`}
      rightSection={
        <Tooltip label={t`Choose what this data will be called in Metabase.`}>
          <Icon name="info" />
        </Tooltip>
      }
      {...autoFocusProps}
      {...props}
      {...getSharedFieldStyleProps()}
    />
  );
};
