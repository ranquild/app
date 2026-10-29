import {
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
  createApi,
  fetchBaseQuery,
} from "@reduxjs/toolkit/query/react";

import { TAG_TYPES } from "./tags";

const rawBaseQuery = fetchBaseQuery({
  // absolute, so it also works where `fetch` rejects relative URLs (tests under Node)
  baseUrl: `${window.location.origin}/api`,
  credentials: "include",
  // bodies are JSON, except error messages the backend sends as plain text
  responseHandler: "content-type",
});

export type ApiError = FetchBaseQueryError;

const apiQuery: BaseQueryFn<string | FetchArgs, unknown, ApiError> = (
  args,
  api,
  extraOptions,
) => rawBaseQuery(args, api, extraOptions);

export const Api = createApi({
  reducerPath: "metabase-api",
  tagTypes: TAG_TYPES,
  baseQuery: apiQuery,
  endpoints: () => ({}),
});
