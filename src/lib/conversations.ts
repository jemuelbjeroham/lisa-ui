
import { apiRequest } from "./api-client";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
}

export interface ConversationDetail {
  id: string;
  title: string | null;
  messages: ConversationMessage[];
}

interface ConversationListResponse {
  conversations: ConversationSummary[];
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const response = await apiRequest<ConversationListResponse>(
    "/api/v1/conversations",
  );

  return response.conversations;
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail> {
  return apiRequest<ConversationDetail>(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
  );
}

interface ConversationActionResponse {
  message: string;
}

export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<void> {
  await apiRequest<ConversationActionResponse>(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    },
  );
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  await apiRequest<ConversationActionResponse>(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "DELETE",
    },
  );
}
