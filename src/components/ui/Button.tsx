import type { ButtonHTMLAttributes } from "react";
import { classNames } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={classNames(
        "rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" ? "bg-emerald-400 text-zinc-950 hover:bg-emerald-300" : "border border-zinc-700 text-zinc-200 hover:bg-zinc-800",
        className,
      )}
      {...props}
    />
  );
}
