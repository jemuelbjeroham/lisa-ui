
import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1117] px-6 text-[#e6edf3]">
      <section className="w-full max-w-md rounded-lg border border-[#30363d] bg-[#161b22] p-8">
        <Link
          href="/sign-in"
          className="text-sm font-semibold text-[#58a6ff] hover:underline"
        >
          L.I.S.A.
        </Link>

        <h1 className="mb-3 mt-8 text-2xl font-semibold">
          Forgot your password?
        </h1>

        <p className="text-sm leading-6 text-[#9198a1]">
          Password recovery is managed by your administrator. Please
          contact your administrator to regain access to your account.
        </p>

        <Link
          href="/sign-in"
          className="mt-7 block w-full rounded-md border border-[#30363d] bg-[#21262d] px-4 py-2 text-center text-sm font-semibold hover:bg-[#30363d]"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
