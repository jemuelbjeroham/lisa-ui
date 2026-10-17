import Link from "next/link";
import Image from "next/image";

export function Navbar() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="flex items-center gap-3 font-semibold tracking-wide">
        <Image src="/images/lisa-logo.svg" alt="LISA" width={120} height={36} priority />
      </Link>
      <nav className="flex items-center gap-5 text-sm text-zinc-400">
        <Link href="/sign-in" className="transition hover:text-white">Sign in</Link>
        <Link href="/sign-up" className="rounded-md bg-white px-4 py-2 font-medium text-black transition hover:bg-zinc-200">Get started</Link>
      </nav>
    </header>
  );
}
