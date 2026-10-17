export function ToolActivity({ label, detail }: { label: string; detail?: string }) {
  return <div className="border-l-2 border-emerald-400 pl-3 text-sm"><p className="font-medium text-zinc-200">{label}</p>{detail && <p className="mt-1 text-zinc-500">{detail}</p>}</div>;
}
