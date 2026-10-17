import Link from "next/link";

export function UserMenu() {
  return <Link href="/app/settings" aria-label="Account settings" title="Account settings" className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800">U</Link>;
}
