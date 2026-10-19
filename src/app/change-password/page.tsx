
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_LISA_API_URL ?? "http://localhost:8008"
).replace(/\/$/, "");

type Message = {
  type: "success" | "error";
  text: string;
};

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (message?.type !== "success") {
      return;
    }

    const timeout = window.setTimeout(() => {
      router.replace("/sign-in");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [message, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({
        type: "error",
        text: "Please complete all three password fields.",
      });
      return;
    }

    if (newPassword.length < 12) {
      setMessage({
        type: "error",
        text: "Your new password must contain at least 12 characters.",
      });
      return;
    }

    if (newPassword.length > 1024) {
      setMessage({
        type: "error",
        text: "Your new password exceeds the maximum allowed length.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({
        type: "error",
        text: "The new password and confirmation do not match.",
      });
      return;
    }

    if (currentPassword === newPassword) {
      setMessage({
        type: "error",
        text: "Your new password must differ from your current password.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/auth/change-password`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          setMessage({
            type: "error",
            text: "Your session has expired. Please sign in again.",
          });

          window.setTimeout(() => {
            router.replace("/sign-in");
          }, 1500);

          return;
        }

        const detail =
          typeof data?.detail === "string" ? data.detail : null;

        setMessage({
          type: "error",
          text: detail ?? "Unable to change your password. Please try again.",
        });

        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setMessage({
        type: "success",
        text: "Password changed successfully. Redirecting you to sign in...",
      });
    } catch {
      setMessage({
        type: "error",
        text: "Unable to connect to LISA. Check your connection and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClassName =
    "mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  function renderPasswordField({
    id,
    label,
    value,
    onChange,
    visible,
    onToggle,
    placeholder,
    autoComplete,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    visible: boolean;
    onToggle: () => void;
    placeholder: string;
    autoComplete: string;
  }) {
    return (
      <div>
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
        </label>

        <div className="relative">
          <input
            id={id}
            name={id}
            type={visible ? "text" : "password"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete={autoComplete}
            placeholder={placeholder}
            maxLength={1024}
            required
            disabled={isSubmitting || message?.type === "success"}
            className={`${inputClassName} pr-20`}
          />

          <button
            type="button"
            onClick={onToggle}
            disabled={isSubmitting || message?.type === "success"}
            className="absolute inset-y-0 right-0 mt-2 px-4 text-sm font-medium text-gray-500 transition hover:text-gray-900 disabled:cursor-not-allowed"
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-gray-900"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
              L
            </span>
            LISA
          </Link>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-gray-900">
            Change your password
          </h1>

          <p className="mt-2 text-sm leading-6 text-gray-600">
            Choose a new password to keep your account secure.
          </p>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {renderPasswordField({
              id: "current-password",
              label: "Current password",
              value: currentPassword,
              onChange: setCurrentPassword,
              visible: showCurrentPassword,
              onToggle: () => setShowCurrentPassword((value) => !value),
              placeholder: "Enter your current password",
              autoComplete: "current-password",
            })}

            {renderPasswordField({
              id: "new-password",
              label: "New password",
              value: newPassword,
              onChange: setNewPassword,
              visible: showNewPassword,
              onToggle: () => setShowNewPassword((value) => !value),
              placeholder: "At least 12 characters",
              autoComplete: "new-password",
            })}

            {renderPasswordField({
              id: "confirm-password",
              label: "Confirm new password",
              value: confirmPassword,
              onChange: setConfirmPassword,
              visible: showConfirmPassword,
              onToggle: () => setShowConfirmPassword((value) => !value),
              placeholder: "Enter your new password again",
              autoComplete: "new-password",
            })}

            <p className="text-xs leading-5 text-gray-500">
              Your new password must be at least 12 characters long and must
              differ from your current password.
            </p>

            {message && (
              <div
                role="alert"
                aria-live="polite"
                className={`rounded-xl border px-4 py-3 text-sm ${
                  message.type === "success"
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || message?.type === "success"}
              className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Updating password..." : "Update password"}
            </button>
          </form>

          <div className="mt-6 border-t border-gray-100 pt-5 text-center">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
            >
              Back to sign in
            </Link>
          </div>
        </section>

        <p className="mt-6 text-center text-xs leading-5 text-gray-500">
          For your security, changing your password signs out all active
          sessions.
        </p>
      </div>
    </main>
  );
}
