import Link from "next/link";
import { AUTH_PROVIDER_CONFIGURED } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SignUpForm() {
  return (
    <form className="space-y-4">
      <label className="block space-y-2 text-sm text-zinc-300">Name<Input autoComplete="name" placeholder="Your name" required /></label>
      <label className="block space-y-2 text-sm text-zinc-300">Email<Input type="email" autoComplete="email" placeholder="you@company.com" required /></label>
      <label className="block space-y-2 text-sm text-zinc-300">Password<Input type="password" autoComplete="new-password" minLength={8} required /></label>
      {!AUTH_PROVIDER_CONFIGURED && <p className="text-sm text-amber-300">Authentication is not configured for this project yet.</p>}
      <Button className="w-full" type="submit" disabled={!AUTH_PROVIDER_CONFIGURED}>Create account</Button>
      <p className="text-sm text-zinc-400">Already registered? <Link href="/sign-in" className="text-white hover:underline">Sign in</Link></p>
    </form>
  );
}
