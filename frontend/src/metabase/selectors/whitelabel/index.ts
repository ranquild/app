import type { State } from "metabase/store";

export function getApplicationName(_state: State) {
  return "Metabase";
}

export function getShowMetabaseLinks(_state: State) {
  return true;
}
