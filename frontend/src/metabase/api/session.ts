import type { EnterpriseSettings } from "metabase-types/api";

import { Api } from "./api";

export const sessionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getSessionProperties: builder.query<EnterpriseSettings, void>({
      query: () => "/session/properties",
      providesTags: ["session-properties"],
    }),
  }),
});

export const { useGetSessionPropertiesQuery } = sessionApi;
