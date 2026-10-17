import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-6 text-zinc-100"><div className="max-w-md text-center"><p className="text-sm text-emerald-400">404</p><h1 className="mt-3 text-3xl font-semibold">This page is not here.</h1><p className="mt-3 text-zinc-400">The address may be incorrect or the page may have moved.</p><Link href="/" className="mt-7 inline-block rounded-md bg-white px-4 py-2 text-sm font-medium text-black">Back to LISA</Link></div></main>;
}
