import type {
  Conversation,
  ConversationId,
  CreateConversationRequest,
  EnvironmentId,
  ListResponse,
  PromptConversationRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag } from "./tags";

export const conversationApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listConversations: builder.query<ListResponse<Conversation>, EnvironmentId>({
      query: (environmentId) => ({ url: "/conversation", params: { environment_id: environmentId } }),
      providesTags: (response) => [
        listTag("conversation"),
        ...(response?.data ?? []).map((conversation) => idTag("conversation", conversation.id)),
      ],
    }),
    createConversation: builder.mutation<Conversation, CreateConversationRequest>({
      query: (body) => ({ method: "POST", url: "/conversation", body }),
      invalidatesTags: [listTag("conversation")],
    }),
    deleteConversation: builder.mutation<void, ConversationId>({
      query: (id) => ({ method: "DELETE", url: `/conversation/${id}` }),
      invalidatesTags: [listTag("conversation")],
    }),
    promptConversation: builder.mutation<Conversation, PromptConversationRequest>({
      query: ({ id, message }) => ({ method: "POST", url: `/conversation/${id}/prompt`, body: { message } }),
      invalidatesTags: [listTag("conversation")],
    }),
    abortConversation: builder.mutation<Conversation, ConversationId>({
      query: (id) => ({ method: "POST", url: `/conversation/${id}/abort` }),
    }),
  }),
});

export const {
  useListConversationsQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  usePromptConversationMutation,
  useAbortConversationMutation,
} = conversationApi;
