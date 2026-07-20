import { useEffect, useState } from "react";

/**
 * Cowrie-shell roll graphic. `value` is the throw result (1-4 or 8). The number
 * of "mouth-up" (open) shells encodes the value; 8 means all four landed closed.
 * Pass `rolling` while the throw is in flight for a tumble animation.
 */
export function ShellDice({
  value,
  size = "md",
  animate = false,
  rolling = false,
}: {
  value: number | null;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  rolling?: boolean;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 70);
    return () => window.clearInterval(id);
  }, [rolling]);

  const settledOpen = value == null ? 0 : value === 8 ? 0 : value;
  const shellPx = size === "lg" ? 34 : size === "sm" ? 16 : 26;
  const numberCls =
    size === "lg"
      ? "text-7xl sm:text-8xl"
      : size === "sm"
        ? "text-2xl"
        : "text-5xl";

  return (
    <div className={`flex flex-col items-center ${size === "sm" ? "gap-1.5" : "gap-3"}`}>
      <div className={`flex items-center ${size === "sm" ? "gap-1" : "gap-1.5"}`}>
        {[0, 1, 2, 3].map((i) => {
          const open = rolling
            ? (tick + i * 2 + (tick % 3)) % 2 === 0
            : i < settledOpen;
          return (
            <Shell
              key={i}
              open={open}
              px={shellPx}
              className={rolling || animate ? "animate-shellRoll" : ""}
              delayMs={i * 60}
            />
          );
        })}
      </div>
      <div
        className={`font-display font-bold tabular-nums leading-none text-warn ${numberCls} ${
          rolling ? "opacity-40" : ""
        }`}
      >
        {rolling ? "…" : (value ?? "—")}
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
        <ellipse
          cx="13"
          cy="17.5"
          rx="12"
          ry="16"
          fill="#F3E4CE"
          stroke="#C9A876"
          strokeWidth="1.5"
        />
        {open ? (
          <path
            d="M13 5 C 7 9, 7 26, 13 30 C 19 26, 19 9, 13 5 Z"
            fill="#8A5A2B"
          />
        ) : (
          <g>
            <ellipse cx="13" cy="17.5" rx="6.5" ry="12" fill="#D8C09A" />
            <line
              x1="13"
              y1="7"
              x2="13"
              y2="28"
              stroke="#B08A54"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
