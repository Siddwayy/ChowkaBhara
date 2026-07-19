/**
 * Cowrie-shell roll graphic. `value` is the throw result (1-4 or 8). The number
 * of "mouth-up" (open) shells encodes the value; 8 means all four landed closed.
 */
export function ShellDice({
  value,
  size = "md",
  animate = false,
}: {
  value: number | null;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}) {
  const openCount = value == null ? 0 : value === 8 ? 0 : value;
  const shellPx = size === "lg" ? 34 : size === "sm" ? 18 : 26;
  const numberCls =
    size === "lg"
      ? "text-7xl sm:text-8xl"
      : size === "sm"
        ? "text-3xl"
        : "text-5xl";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Shell
            key={i}
            open={i < openCount}
            px={shellPx}
            className={animate ? "animate-shellRoll" : ""}
            delayMs={i * 60}
          />
        ))}
      </div>
      <div
        className={`font-display font-bold tabular-nums leading-none text-warn ${numberCls}`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function Shell({
  open,
  px,
  className = "",
  delayMs = 0,
}: {
  open: boolean;
  px: number;
  className?: string;
  delayMs?: number;
}) {
  return (
    <div
      className={className}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-hidden="true"
    >
      <svg width={px} height={px * 1.35} viewBox="0 0 26 35">
        <ellipse cx="13" cy="17.5" rx="12" ry="16" fill="#F3E4CE" stroke="#C9A876" strokeWidth="1.5" />
        {open ? (
          <path
            d="M13 5 C 7 9, 7 26, 13 30 C 19 26, 19 9, 13 5 Z"
            fill="#8A5A2B"
          />
        ) : (
          <g>
            <ellipse cx="13" cy="17.5" rx="6.5" ry="12" fill="#D8C09A" />
            <line x1="13" y1="7" x2="13" y2="28" stroke="#B08A54" strokeWidth="1.5" />
          </g>
        )}
      </svg>
    </div>
  );
}
