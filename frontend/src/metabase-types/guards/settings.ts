import { type EngineKey, engineKeys } from "metabase-types/api";

export function isEngineKey(value: string | undefined): value is EngineKey {
  return engineKeys.some((engineKey) => engineKey === value);
}
