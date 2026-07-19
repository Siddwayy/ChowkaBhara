export function StatusStrip({
  turnName,
  isMyTurn = false,
  roll,
  seconds,
}: {
  turnName?: string | null;
  isMyTurn?: boolean;
  roll?: number | null;
  seconds?: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface/15 px-3 py-2 text-sm text-surface backdrop-blur-sm">
      {turnName != null && (
        <span
          className={`rounded-full px-3 py-1 font-display font-semibold ${
            isMyTurn ? "bg-o2 text-ink" : "bg-surface/25 text-surface"
          }`}
        >
          {isMyTurn ? "Your turn" : `${turnName}'s turn`}
        </span>
      )}
      {roll != null && (
        <span className="rounded-full bg-warn px-3 py-1 font-display font-semibold tabular-nums text-ink">
          Roll {roll}
        </span>
      )}
      {seconds != null && seconds > 0 && (
        <span className="rounded-full bg-surface px-3 py-1 font-display font-semibold tabular-nums text-ink">
          {seconds}s
        </span>
      )}
    </div>
  );
}
