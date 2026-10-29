import type {
  AiProviderSettings,
  AiProviderTestRequest,
  AiProviderTestResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const aiProviderApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getAiProviderSettings: builder.query<AiProviderSettings, void>({
      query: () => "/ai-provider/settings",
      providesTags: ["ai-provider"],
    }),
    updateAiProviderSettings: builder.mutation<
      AiProviderSettings,
      Partial<AiProviderSettings>
    >({
      query: (body) => ({ method: "PUT", url: "/ai-provider/settings", body }),
      invalidatesTags: ["ai-provider"],
    }),
    testAiProviderConnection: builder.mutation<
      AiProviderTestResponse,
      AiProviderTestRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/ai-provider/test-connection",
        body,
      }),
    }),
  }),
});

export const {
  useGetAiProviderSettingsQuery,
  useUpdateAiProviderSettingsMutation,
  useTestAiProviderConnectionMutation,
} = aiProviderApi;
