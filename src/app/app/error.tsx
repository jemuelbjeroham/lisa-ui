"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-black px-6 text-zinc-100"><div className="text-center"><h1 className="text-xl font-semibold">The workspace could not load.</h1><button type="button" onClick={reset} className="mt-5 rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900">Try again</button></div></main>;
}
