"use client";

import { useState } from "react";
import { streamLisaChat } from "@/lib/lisa-api";
import type { ChatMessage } from "@/types/chat";

export function useChat(conversationId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage(message: string, enableThinking = false) {
    if (!message.trim() || isLoading) return;
    setMessages((current) => [...current, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setIsLoading(true);

    try {
      const response = await streamLisaChat({
        conversation_id: conversationId,
        message,
        enable_thinking: enableThinking,
      });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; content: string };
          if (event.type === "content") {
            setMessages((current) => {
              const next = [...current];
              const last = next.at(-1);
              if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + event.content };
              return next;
            });
          }
        }
        if (done) break;
      }
    } finally {
      setIsLoading(false);
    }
  }

  return { messages, isLoading, sendMessage };
}
