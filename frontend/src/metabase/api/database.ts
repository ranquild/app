import type {
  CreateDatabaseRequest,
  Database,
  DatabaseId,
  ListResponse,
  UpdateDatabaseRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag } from "./tags";

export const databaseApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listDatabases: builder.query<ListResponse<Database>, void>({
      query: () => "/database",
      providesTags: (response) => [
        listTag("database"),
        ...(response?.data ?? []).map((db) => idTag("database", db.id)),
      ],
    }),
    getDatabase: builder.query<Database, DatabaseId>({
      query: (id) => `/database/${id}`,
      providesTags: (_response, _error, id) => [idTag("database", id)],
    }),
    createDatabase: builder.mutation<Database, CreateDatabaseRequest>({
      query: (body) => ({ method: "POST", url: "/database", body }),
      invalidatesTags: [listTag("database")],
    }),
    updateDatabase: builder.mutation<Database, UpdateDatabaseRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/database/${id}`,
        body,
      }),
      invalidatesTags: (_response, _error, { id }) => [
        listTag("database"),
        idTag("database", id),
      ],
    }),
    deleteDatabase: builder.mutation<void, DatabaseId>({
      query: (id) => ({ method: "DELETE", url: `/database/${id}` }),
      invalidatesTags: (_response, _error, id) => [
        listTag("database"),
        idTag("database", id),
      ],
    }),
  }),
});

export const {
  useListDatabasesQuery,
  useGetDatabaseQuery,
  useCreateDatabaseMutation,
  useUpdateDatabaseMutation,
  useDeleteDatabaseMutation,
} = databaseApi;
