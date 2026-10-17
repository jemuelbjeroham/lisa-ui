import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType } from "@/types/chat";

export function ChatMessage({ message }: { message: ChatMessageType }) {
  if (message.role === "user") return <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-xl bg-zinc-800 px-4 py-3 text-sm leading-6 text-zinc-100">{message.content}</div>;
  return <div className="prose prose-invert max-w-none text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>;
}
