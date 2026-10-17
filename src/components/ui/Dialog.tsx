import type { ReactNode } from "react";

export function Dialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <dialog open aria-label={title} className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-6 text-zinc-100 backdrop:bg-black/70">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </dialog>
  );
}
