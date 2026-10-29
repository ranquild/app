import { sessionApi } from "metabase/api";
import type { State } from "metabase/store";
import type { EnterpriseSettingKey, EnterpriseSettings } from "metabase-types/api";

const selectSessionProperties = sessionApi.endpoints.getSessionProperties.select();

const EMPTY_SETTINGS: EnterpriseSettings = {};

export const getSettings = (state: State): EnterpriseSettings =>
  selectSessionProperties(state).data ?? EMPTY_SETTINGS;

export const getSetting = <T extends EnterpriseSettingKey>(
  state: State,
  key: T,
): EnterpriseSettings[T] => getSettings(state)[key];
