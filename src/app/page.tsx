import { Features } from "@/components/landing/Features";
import { Hero } from "@/components/landing/Hero";
import { Navbar } from "@/components/landing/Navbar";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <Navbar />
      <Hero />
      <Features />
      <footer className="mx-auto max-w-6xl border-t border-zinc-800 px-6 py-5 text-xs text-zinc-600">LISA · Network Operations AI Assistant</footer>
    </main>
  );
}
