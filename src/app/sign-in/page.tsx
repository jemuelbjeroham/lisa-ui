import Link from "next/link";
import { SignInForm } from "@/components/auth/SignInForm";

export default function SignInPage() {
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-6 text-zinc-100"><section className="w-full max-w-md"><Link href="/" className="text-sm font-semibold">LISA</Link><h1 className="mb-2 mt-10 text-3xl font-semibold">Welcome back</h1><p className="mb-8 text-sm text-zinc-400">Sign in to continue to your workspace.</p><SignInForm /></section></main>;
}
