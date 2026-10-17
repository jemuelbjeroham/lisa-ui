import type { ReactNode } from "react";

export default function ProtectedAppLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-black">{children}</div>;
}
