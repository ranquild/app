import { useDispatch as useReduxDispatch, useSelector as useReduxSelector } from "react-redux";

import type { Dispatch, State } from "metabase/store";

export const useDispatch = useReduxDispatch.withTypes<Dispatch>();
export const useSelector = useReduxSelector.withTypes<State>();
