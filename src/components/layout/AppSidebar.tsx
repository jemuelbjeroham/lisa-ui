import Link from "next/link";

export function AppSidebar() {
  return (
    <aside className="flex items-center justify-between border-b border-zinc-800 px-5 py-3 text-sm text-zinc-300">
      <Link href="/app" className="font-semibold text-white">LISA</Link>
      <nav className="flex gap-4"><Link href="/app" className="hover:text-white">Chat</Link><Link href="/app/settings" className="hover:text-white">Settings</Link></nav>
    </aside>
  );
}
