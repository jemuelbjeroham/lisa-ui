
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/lib/auth";

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 12) {
      setError("Your new password must contain at least 12 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("Your new password must differ from your current password.");
      return;
    }

    setIsSubmitting(true);

    try {
      await changePassword(currentPassword, newPassword);

      setSuccess(
        "Your password has been changed. Please sign in again with your new password.",
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to change your password. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0d1117] px-6 py-10 text-[#e6edf3]">
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={() => router.push("/app/settings")}
          className="mb-6 text-sm text-[#58a6ff] hover:underline"
        >
          ← Back to settings
        </button>

        <h1 className="text-2xl font-semibold">Change password</h1>
        <p className="mt-2 text-sm text-[#9198a1]">
          Choose a new password with at least 12 characters.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-7 space-y-5 rounded-lg border border-[#30363d] bg-[#161b22] p-5"
        >
          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="rounded-md border border-green-900 bg-green-950/40 px-3 py-2 text-sm text-green-300"
            >
              {success}
              <button
                type="button"
                onClick={() => router.replace("/sign-in")}
                className="mt-3 block font-semibold text-green-300 underline"
              >
                Go to sign in
              </button>
            </div>
          )}

          <div>
            <label htmlFor="currentPassword" className="mb-2 block text-sm font-medium">
              Current password
            </label>
            <input
              id="currentPassword"
              type={showPasswords ? "text" : "password"}
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={isSubmitting || Boolean(success)}
              className="w-full rounded-md border border-[#3d444d] bg-[#0d1117] px-3 py-2 text-sm outline-none focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/20"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="mb-2 block text-sm font-medium">
              New password
            </label>
            <input
              id="newPassword"
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={isSubmitting || Boolean(success)}
              className="w-full rounded-md border border-[#3d444d] bg-[#0d1117] px-3 py-2 text-sm outline-none focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/20"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isSubmitting || Boolean(success)}
              className="w-full rounded-md border border-[#3d444d] bg-[#0d1117] px-3 py-2 text-sm outline-none focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/20"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#9198a1]">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(event) => setShowPasswords(event.target.checked)}
              disabled={isSubmitting || Boolean(success)}
              className="accent-[#58a6ff]"
            />
            Show passwords
          </label>

          <button
            type="submit"
            disabled={isSubmitting || Boolean(success)}
            className="w-full rounded-md border border-[#3d444d] bg-[#21262d] px-4 py-2 text-sm font-semibold hover:bg-[#30363d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Updating password…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
