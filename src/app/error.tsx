"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-6 text-zinc-100"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold">Something went wrong.</h1><p className="mt-3 text-zinc-400">The page could not be loaded. Try again.</p><button type="button" onClick={reset} className="mt-6 rounded-md bg-white px-4 py-2 text-sm font-medium text-black">Try again</button></div></main>;
}
