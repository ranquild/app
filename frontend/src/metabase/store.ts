import { configureStore } from "@reduxjs/toolkit";

import { Api } from "metabase/api";

export function getStore() {
  return configureStore({
    reducer: {
      [Api.reducerPath]: Api.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(Api.middleware),
  });
}

export type Store = ReturnType<typeof getStore>;
export type State = ReturnType<Store["getState"]>;
export type Dispatch = Store["dispatch"];
