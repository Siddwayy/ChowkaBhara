import type { ReactNode } from "react";

export function PhaseShell({
  tone = "calm",
  children,
  className = "",
}: {
  tone?: "calm" | "talk" | "danger" | "success";
  children: ReactNode;
  className?: string;
}) {
  const ring =
    tone === "danger"
      ? "ring-danger/40 bg-danger/10"
      : tone === "success"
        ? "ring-o2/40 bg-o2/10"
        : tone === "talk"
          ? "ring-warn/40 bg-warn/10"
          : "ring-surface/20 bg-surface/10";

  return (
    <div
      className={`animate-fadeIn rounded-3xl p-5 ring-2 sm:p-6 ${ring} ${className}`}
    >
      {children}
    </div>
  );
}
