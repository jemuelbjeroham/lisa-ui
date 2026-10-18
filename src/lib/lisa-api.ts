
import { apiRequest } from "./api-client";

export interface ChatRequest {
  message: string;
  conversation_id?: string;
}

export interface ChatResponse {
  conversation_id: string;
  response: string;
}

export interface ConversationListResponse {
  conversations: string[];
}

export async function listConversations(): Promise<ConversationListResponse> {
  return apiRequest<ConversationListResponse>("/api/v1/conversations");
}

export async function sendMessage(
  request: ChatRequest,
): Promise<ChatResponse> {
  return apiRequest<ChatResponse>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
