export function Instruction({
  title,
  subtitle,
  tone = "calm",
  compact = false,
}: {
  title: string;
  subtitle?: string;
  tone?: "calm" | "talk" | "danger" | "success";
  /** Smaller titles for tight phone viewports. */
  compact?: boolean;
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
      <h2
        className={`font-display font-bold leading-tight ${titleColor} ${
          compact ? "text-xl sm:text-3xl" : "text-3xl sm:text-4xl"
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-1 leading-relaxed text-surface/80 sm:mt-2 ${
            compact ? "text-sm sm:text-base" : "text-base sm:text-lg"
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
