import Link from "next/link";
import { AUTH_PROVIDER_CONFIGURED } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SignInForm() {
  return (
    <form className="space-y-4">
      <label className="block space-y-2 text-sm text-zinc-300">Email<Input type="email" autoComplete="email" placeholder="you@company.com" required /></label>
      <label className="block space-y-2 text-sm text-zinc-300">Password<Input type="password" autoComplete="current-password" required /></label>
      {!AUTH_PROVIDER_CONFIGURED && <p className="text-sm text-amber-300">Authentication is not configured for this project yet.</p>}
      <Button className="w-full" type="submit" disabled={!AUTH_PROVIDER_CONFIGURED}>Sign in</Button>
      <div className="flex justify-between text-sm text-zinc-400"><Link href="/forgot-password" className="hover:text-white">Forgot password?</Link><Link href="/sign-up" className="hover:text-white">Create account</Link></div>
    </form>
  );
}
