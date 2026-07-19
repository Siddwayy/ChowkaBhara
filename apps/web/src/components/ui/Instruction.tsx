export function Instruction({
  title,
  subtitle,
  tone = "calm",
}: {
  title: string;
  subtitle?: string;
  tone?: "calm" | "talk" | "danger" | "success";
}) {
  const titleColor =
    tone === "danger"
      ? "text-danger"
      : tone === "success"
        ? "text-o2"
        : tone === "talk"
          ? "text-warn"
          : "text-surface";

  return (
    <div className="animate-fadeIn text-center">
      <h2 className={`font-display text-3xl font-bold leading-tight sm:text-4xl ${titleColor}`}>
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 text-base leading-relaxed text-surface/80 sm:text-lg">{subtitle}</p>
      )}
    </div>
  );
}
