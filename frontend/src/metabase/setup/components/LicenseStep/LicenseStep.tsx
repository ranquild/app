import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { getErrorMessage, useSetupLicenseMutation } from "metabase/api";
import { Anchor, Button, Stack, TextInput } from "metabase/ui";

import { LICENSE_HELP_URL } from "../../constants";

interface LicenseStepProps {
  onDone: () => void;
}

export function LicenseStep({ onDone }: LicenseStepProps) {
  const [licenseToken, setLicenseToken] = useState("");
  const [setupLicense, { error, isLoading }] = useSetupLicenseMutation();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await setupLicense({ license_token: licenseToken.trim() });
    if (!("error" in result)) {
      onDone();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <TextInput
          label={t`License token`}
          placeholder="64 hexadecimal characters"
          value={licenseToken}
          onChange={(event) => setLicenseToken(event.currentTarget.value)}
          error={error ? getErrorMessage(error) : undefined}
          styles={{ input: { fontFamily: "var(--mb-default-monospace-font-family)" } }}
        />
        <Anchor href={LICENSE_HELP_URL} target="_blank" fw={700} fz="sm">
          {t`Where do I find this?`}
        </Anchor>
        <div>
          <Button type="submit" variant="filled" loading={isLoading} disabled={licenseToken.trim() === ""}>
            {t`Activate`}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
