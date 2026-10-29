import type { SettingDefinition } from "metabase-types/api";

import { Api } from "./api";

export interface UpdateSettingRequest {
  key: string;
  value: unknown;
}

export const settingApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listSettings: builder.query<SettingDefinition[], void>({
      query: () => "/setting",
      providesTags: ["setting"],
    }),
    updateSetting: builder.mutation<void, UpdateSettingRequest>({
      query: ({ key, value }) => ({
        method: "PUT",
        url: `/setting/${encodeURIComponent(key)}`,
        body: { value },
      }),
      invalidatesTags: ["setting", "session-properties"],
    }),
    updateSettings: builder.mutation<void, Record<string, unknown>>({
      query: (body) => ({ method: "PUT", url: "/setting", body }),
      invalidatesTags: ["setting", "session-properties"],
    }),
  }),
});

export const {
  useListSettingsQuery,
  useUpdateSettingMutation,
  useUpdateSettingsMutation,
} = settingApi;
