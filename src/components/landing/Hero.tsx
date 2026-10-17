import Link from "next/link";

export function Hero() {
  return (
    <section className="mx-auto grid min-h-[62vh] max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="mb-5 text-sm font-medium uppercase tracking-[0.18em] text-emerald-400">Network operations, clearer</p>
        <h1 className="max-w-2xl text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">Meet LISA, your network operations assistant.</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">Investigate incidents, reason through configurations, and get practical troubleshooting guidance in one focused workspace.</p>
        <Link href="/app" className="mt-9 inline-flex items-center gap-3 rounded-md bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300">Open LISA <span aria-hidden="true">→</span></Link>
      </div>
      <div className="border-y border-zinc-800 py-8 md:border-l md:border-y-0 md:pl-10">
        <p className="text-sm text-zinc-500">READY WHEN YOU ARE</p>
        <div className="mt-6 space-y-5">
          <p className="border-l-2 border-emerald-400 pl-4 text-zinc-200">Trace a connectivity issue across the network.</p>
          <p className="border-l-2 border-zinc-700 pl-4 text-zinc-400">Understand what changed and what to check next.</p>
          <p className="border-l-2 border-zinc-700 pl-4 text-zinc-400">Keep investigations organized by conversation.</p>
        </div>
      </div>
    </section>
  );
}
