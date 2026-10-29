import type {
  SetupAiProviderRequest,
  SetupLicenseRequest,
  SetupStatus,
  StatusResponse,
} from "metabase-types/api";

import { Api } from "./api";

export const setupApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getSetupStatus: builder.query<SetupStatus, void>({
      query: () => "/setup",
      providesTags: ["setup"],
    }),
    setupLicense: builder.mutation<StatusResponse, SetupLicenseRequest>({
      query: (body) => ({ method: "POST", url: "/setup/license", body }),
      invalidatesTags: ["setup", "license", "session-properties"],
    }),
    setupAiProvider: builder.mutation<StatusResponse, SetupAiProviderRequest>({
      query: (body) => ({ method: "POST", url: "/setup/ai-provider", body }),
      invalidatesTags: ["setup", "ai-provider", "session-properties"],
    }),
  }),
});

export const { useGetSetupStatusQuery, useSetupLicenseMutation, useSetupAiProviderMutation } = setupApi;
