"use client";

import { useEffect, useState } from "react";
import type { Conversation } from "@/types/conversation";

const STORAGE_KEY = "lisa-conversations";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setConversations(JSON.parse(stored) as Conversation[]);
    });
  }, []);

  useEffect(() => {
    if (conversations.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    }
  }, [conversations]);

  return { conversations, setConversations };
}
