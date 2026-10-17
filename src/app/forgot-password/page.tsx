import Link from "next/link";
import { AUTH_PROVIDER_CONFIGURED } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-6 text-zinc-100"><section className="w-full max-w-md"><Link href="/" className="text-sm font-semibold">LISA</Link><h1 className="mb-2 mt-10 text-3xl font-semibold">Reset your password</h1><p className="mb-8 text-sm text-zinc-400">Enter the email associated with your account.</p><form className="space-y-4"><label className="block space-y-2 text-sm text-zinc-300">Email<Input type="email" autoComplete="email" required /></label>{!AUTH_PROVIDER_CONFIGURED && <p className="text-sm text-amber-300">Authentication is not configured for this project yet.</p>}<Button type="submit" className="w-full" disabled={!AUTH_PROVIDER_CONFIGURED}>Send reset link</Button></form></section></main>;
}
