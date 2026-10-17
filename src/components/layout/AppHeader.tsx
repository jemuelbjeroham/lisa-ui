export function AppHeader({ title }: { title: string }) {
  return <header className="flex min-h-14 items-center justify-between border-b border-zinc-800 px-5"><h1 className="text-sm font-medium text-zinc-200">{title}</h1><span className="text-xs text-zinc-500">Network Operations AI Assistant</span></header>;
}
