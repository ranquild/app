import type {
  CreateEnvironmentRequest,
  Environment,
  EnvironmentCredentials,
  EnvironmentId,
  EnvironmentLogsRequest,
  ListEnvironmentsRequest,
  ListResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag } from "./tags";

export const environmentApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listEnvironments: builder.query<ListResponse<Environment>, ListEnvironmentsRequest | void>({
      query: (params) => ({ url: "/environment", params: params ?? undefined }),
      providesTags: (response) => [
        listTag("environment"),
        ...(response?.data ?? []).map((environment) => idTag("environment", environment.id)),
      ],
    }),
    getEnvironment: builder.query<Environment, EnvironmentId>({
      query: (id) => `/environment/${id}`,
      providesTags: (_response, _error, id) => [idTag("environment", id)],
    }),
    createEnvironment: builder.mutation<Environment, CreateEnvironmentRequest>({
      query: (body) => ({ method: "POST", url: "/environment", body }),
      invalidatesTags: [listTag("environment")],
    }),
    deleteEnvironment: builder.mutation<void, EnvironmentId>({
      query: (id) => ({ method: "DELETE", url: `/environment/${id}` }),
      invalidatesTags: [listTag("environment")],
    }),
    startEnvironment: builder.mutation<Environment, EnvironmentId>({
      query: (id) => ({ method: "POST", url: `/environment/${id}/start` }),
      invalidatesTags: (_response, _error, id) => [listTag("environment"), idTag("environment", id)],
    }),
    stopEnvironment: builder.mutation<Environment, EnvironmentId>({
      query: (id) => ({ method: "POST", url: `/environment/${id}/stop` }),
      invalidatesTags: (_response, _error, id) => [listTag("environment"), idTag("environment", id)],
    }),
    getEnvironmentLogs: builder.query<string, EnvironmentLogsRequest>({
      query: ({ id, ...params }) => ({ url: `/environment/${id}/logs`, params }),
      transformResponse: (response: { logs: string }) => response.logs,
    }),
    createEnvironmentMetabaseSession: builder.mutation<void, EnvironmentId>({
      query: (id) => ({ method: "POST", url: `/environment/${id}/metabase-session` }),
    }),
    getEnvironmentCredentials: builder.query<EnvironmentCredentials, EnvironmentId>({
      query: (id) => `/environment/${id}/credentials`,
      providesTags: (_response, _error, id) => [idTag("environment", id)],
    }),
  }),
});

export const {
  useListEnvironmentsQuery,
  useGetEnvironmentQuery,
  useCreateEnvironmentMutation,
  useDeleteEnvironmentMutation,
  useStartEnvironmentMutation,
  useStopEnvironmentMutation,
  useGetEnvironmentLogsQuery,
  useGetEnvironmentCredentialsQuery,
  useCreateEnvironmentMetabaseSessionMutation,
} = environmentApi;
