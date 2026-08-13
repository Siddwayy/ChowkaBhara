/** Lightweight safe-cell house icon, kept upright against board rotation. */
export function SafeHouse({
  color = "#000000",
  heavy = false,
  rotation = 0,
}: {
  color?: string;
  heavy?: boolean;
  /** Board rotation (deg) to cancel out so the house stays upright. */
  rotation?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={heavy ? "h-[70%] w-[70%]" : "h-[60%] w-[60%]"}
      aria-hidden="true"
      style={rotation ? { transform: `rotate(${-rotation}deg)` } : undefined}
    >
      <path
        d="M3 11.2 12 3.5l9 7.7V20a1.5 1.5 0 0 1-1.5 1.5h-5.2v-6.2h-5.6V21.5H4.5A1.5 1.5 0 0 1 3 20z"
        fill={color}
      />
    </svg>
  );
}
