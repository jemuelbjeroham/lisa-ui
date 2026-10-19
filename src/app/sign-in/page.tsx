
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AppProviders";
import { login } from "@/lib/auth";

export default function SignInPage() {
  const router = useRouter();
  const { user, isLoading, refreshUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] px-4 dark:bg-[#0d1117]">
        <p className="text-sm text-gray-500">Checking your session…</p>
      </main>
    );
  }

  if (user) {
    router.replace("/app");

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] dark:bg-[#0d1117]">
        <p className="text-sm text-gray-500">Redirecting to L.I.S.A.…</p>
      </main>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      await refreshUser();

      // Confirm that the new session is recognized before navigating.
      router.replace("/app");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] px-4 py-10 text-[#1f2328] dark:bg-[#0d1117] dark:text-[#e6edf3]">
      <div className="w-full max-w-[340px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gray-300 bg-white text-xl font-semibold text-gray-800 dark:border-[#30363d] dark:bg-[#161b22] dark:text-white">
            L
          </div>

          <h1 className="text-2xl font-normal tracking-tight">
            Sign in to L.I.S.A.
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-[#9198a1]">
            Network Operations Assistant
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-[#d1d9e0] bg-white p-4 dark:border-[#30363d] dark:bg-[#161b22]"
        >
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              placeholder="you@example.com"
              className="w-full rounded-md border border-[#d1d9e0] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/25 disabled:opacity-60 dark:border-[#3d444d] dark:bg-[#0d1117] dark:placeholder:text-[#6e7681]"
            />
          </div>

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label
                htmlFor="password"
                className="block text-sm font-medium"
              >
                Password
              </label>
            </div>

            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                placeholder="Enter your password"
                className="w-full rounded-md border border-[#d1d9e0] bg-white px-3 py-2 pr-16 text-sm outline-none transition focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/25 disabled:opacity-60 dark:border-[#3d444d] dark:bg-[#0d1117] dark:placeholder:text-[#6e7681]"
              />

              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-[#0969da] hover:underline dark:text-[#58a6ff]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || !password}
            className="w-full rounded-md border border-[#1f883d] bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 rounded-lg border border-[#d1d9e0] px-4 py-4 text-center text-sm text-gray-600 dark:border-[#30363d] dark:text-[#9198a1]">
          Access to L.I.S.A. is managed by your administrator.
        </p>

        <p className="mt-8 text-center text-xs text-gray-500 dark:text-[#6e7681]">
          L.I.S.A. · Network Operations Assistant
        </p>
      </div>
    </main>
  );
}
