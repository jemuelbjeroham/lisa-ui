import Link from "next/link";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-6 text-zinc-100"><section className="w-full max-w-md"><Link href="/" className="text-sm font-semibold">LISA</Link><h1 className="mb-2 mt-10 text-3xl font-semibold">Create your account</h1><p className="mb-8 text-sm text-zinc-400">Set up access to your LISA workspace.</p><SignUpForm /></section></main>;
}
