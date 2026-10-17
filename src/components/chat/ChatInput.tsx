import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";

type Props = { value: string; onChange: (value: string) => void; onSend: () => void; disabled?: boolean };

export function ChatInput({ value, onChange, onSend, disabled = false }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSend(); }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }
  return <form onSubmit={submit} className="flex items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2"><textarea aria-label="Message LISA" rows={2} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} className="min-h-12 flex-1 resize-y bg-transparent p-2 text-sm text-white outline-none" placeholder="Message LISA..." /><Button type="submit" disabled={disabled || !value.trim()} aria-label="Send message">Send</Button></form>;
}
