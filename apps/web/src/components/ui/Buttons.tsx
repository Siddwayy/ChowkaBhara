import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "ink";

const styles: Record<Variant, string> = {
  primary:
    "bg-o2 text-ink border-o2-dark shadow-pop hover:brightness-105 disabled:opacity-40",
  secondary:
    "bg-surface text-ink border-surface-muted shadow-pop hover:bg-surface-muted disabled:opacity-40",
  danger:
    "bg-danger text-surface border-danger-dark shadow-pop hover:brightness-105 disabled:opacity-40",
  ghost:
    "bg-transparent text-surface border-surface/40 hover:bg-surface/10 disabled:opacity-40",
  ink: "bg-sky text-surface border-sky-mid shadow-pop hover:brightness-110 disabled:opacity-40",
};

export function PrimaryButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      type="button"
      className={`min-h-14 w-full rounded-2xl border-2 px-4 py-4 font-display text-lg font-semibold tracking-wide transition active:translate-y-0.5 active:shadow-none disabled:active:translate-y-0 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode },
) {
  return <PrimaryButton variant="secondary" {...props} />;
}
