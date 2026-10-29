import { type FormEvent, useState } from "react";
import { t } from "ttag";

import {
  getErrorMessage,
  useGetLicenseQuery,
  useUpdateLicenseMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageHeader } from "metabase/common/components/PageHeader";
import { StatusMessage } from "metabase/common/components/StatusMessage";
import { Badge, Box, Button, Flex, PasswordInput, Text } from "metabase/ui";
import { formatDate } from "metabase/utils/dates";
import type { LicenseStatus } from "metabase-types/api";

import { SettingsCard } from "../../components/SettingsCard/SettingsCard";

export function getPlanTitle(status: LicenseStatus): string {
  if (!status["valid?"]) {
    return t`No active license`;
  }
  return status.plan ? t`${status.plan} — unlimited environments` : t`Pro — unlimited environments`;
}

export function LicenseSettingsPage() {
  const { data, error, isLoading } = useGetLicenseQuery();
  const [licenseToken, setLicenseToken] = useState("");
  const [updateLicense, updateState] = useUpdateLicenseMutation();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    updateLicense({ license_token: licenseToken.trim() });
  };

  return (
    <>
      <PageHeader title={t`License`} description={t`The Metabase license every environment runs with.`} />
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        {data && (
          <form onSubmit={handleSubmit}>
            <SettingsCard>
              <Flex justify="space-between" align="flex-start">
                <Box>
                  <Text fw={700} fz="md">
                    {getPlanTitle(data)}
                  </Text>
                  {data.expires_at && (
                    <Text c="text-secondary" fz="sm">
                      {t`Valid until ${formatDate(data.expires_at)}`}
                    </Text>
                  )}
                </Box>
                <Badge color={data["valid?"] ? "positive" : "neutral"} variant="light" size="sm" tt="none">
                  {data["valid?"] ? t`Active` : t`Inactive`}
                </Badge>
              </Flex>
              <PasswordInput
                label={t`License token`}
                placeholder={data["valid?"] ? "••••••••••••••••••••" : "devenv_lic_…"}
                value={licenseToken}
                onChange={(event) => {
                  setLicenseToken(event.currentTarget.value);
                  updateState.reset();
                }}
              />
              {updateState.isSuccess && <StatusMessage status="success" message={t`License updated`} />}
              {updateState.error && <StatusMessage status="error" message={getErrorMessage(updateState.error)} />}
              <div>
                <Button
                  type="submit"
                  variant="filled"
                  loading={updateState.isLoading}
                  disabled={licenseToken.trim() === ""}
                >
                  {t`Update token`}
                </Button>
              </div>
            </SettingsCard>
          </form>
        )}
      </LoadingAndErrorWrapper>
    </>
  );
}
