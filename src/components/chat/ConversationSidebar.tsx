import type { Conversation } from "@/types/conversation";

export function ConversationSidebar({ conversations, activeId, onSelect }: { conversations: Conversation[]; activeId: string; onSelect: (id: string) => void }) {
  return <nav aria-label="Conversations" className="space-y-1">{conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => onSelect(conversation.id)} aria-current={conversation.id === activeId ? "page" : undefined} className="block w-full truncate rounded px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800">{conversation.title}</button>)}</nav>;
}
