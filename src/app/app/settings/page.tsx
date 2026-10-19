
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AppProviders";

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    setIsSigningOut(true);
    setError("");

    try {
      await signOut();
      router.replace("/sign-in");
    } catch {
      setError("Unable to sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d1117] px-6 py-10 text-[#e6edf3]">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => router.push("/app")}
          className="mb-6 text-sm text-[#58a6ff] hover:underline"
        >
          ← Back to L.I.S.A.
        </button>

        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-[#9198a1]">
          Manage your L.I.S.A. account.
        </p>

        <section className="mt-8 rounded-lg border border-[#30363d] bg-[#161b22] p-5">
          <h2 className="text-base font-semibold">Account</h2>

          <div className="mt-5">
            <p className="text-xs text-[#9198a1]">Display name</p>
            <p className="mt-1 text-sm">
              {user?.display_name || "Not set"}
            </p>
          </div>

          <div className="mt-4">
            <p className="text-xs text-[#9198a1]">Email address</p>
            <p className="mt-1 break-all text-sm">
              {user?.email || "Not available"}
            </p>
          </div>

          <div className="mt-4">
            <p className="text-xs text-[#9198a1]">Account role</p>
            <p className="mt-1 text-sm">
              {user?.is_admin ? "Administrator" : "User"}
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-[#30363d] bg-[#161b22] p-5">
          <h2 className="text-base font-semibold">Security</h2>
          <p className="mt-2 text-sm text-[#9198a1]">
            Change your password to keep your account secure.
          </p>

          <button
            type="button"
            onClick={() => router.push("/app/settings/password")}
            className="mt-4 rounded-md border border-[#3d444d] px-4 py-2 text-sm font-medium hover:bg-[#21262d]"
          >
            Change password
          </button>
        </section>

        <section className="mt-5 rounded-lg border border-[#30363d] bg-[#161b22] p-5">
          <h2 className="text-base font-semibold">Sign out</h2>
          <p className="mt-2 text-sm text-[#9198a1]">
            Sign out of your L.I.S.A. session on this browser.
            Your conversations will not be deleted.
          </p>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="mt-4 rounded-md border border-[#f85149]/60 px-4 py-2 text-sm font-medium text-[#ff7b72] hover:bg-[#f85149]/10 disabled:opacity-60"
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </section>
      </div>
    </main>
  );
}
