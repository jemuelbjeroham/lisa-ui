import { apiUrl } from "@/lib/api-client";

export type LisaChatRequest = {
  conversation_id: string;
  message: string;
  enable_thinking: boolean;
};

export type LisaStreamEvent = {
  type: "reasoning" | "content";
  content: string;
};

export async function streamLisaChat(
  payload: LisaChatRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(apiUrl("/api/v1/chat/stream"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Response body is unavailable");
  }

  return response;
}
