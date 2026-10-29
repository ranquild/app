import { useGetSessionPropertiesQuery } from "metabase/api";
import type { EnterpriseSettingKey, EnterpriseSettings } from "metabase-types/api";

/** The value of a public (or, when logged in, authenticated) setting from `GET /api/session/properties`. */
export const useSetting = <SettingName extends EnterpriseSettingKey>(
  settingName: SettingName,
): EnterpriseSettings[SettingName] | undefined => {
  const { data } = useGetSessionPropertiesQuery();
  return data?.[settingName];
};
