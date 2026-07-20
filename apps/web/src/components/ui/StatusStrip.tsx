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
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-surface/15 px-2.5 py-1.5 text-xs text-surface backdrop-blur-sm sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-sm">
      {turnName != null && (
        <span
          className={`rounded-full px-2.5 py-0.5 font-display font-semibold sm:px-3 sm:py-1 ${
            isMyTurn ? "bg-o2 text-ink" : "bg-surface/25 text-surface"
          }`}
        >
          {isMyTurn ? "Your turn" : `${turnName}'s turn`}
        </span>
      )}
      {roll != null && (
        <span className="rounded-full bg-warn px-2.5 py-0.5 font-display font-semibold tabular-nums text-ink sm:px-3 sm:py-1">
          Roll {roll}
        </span>
      )}
      {seconds != null && seconds > 0 && (
        <span className="rounded-full bg-surface px-2.5 py-0.5 font-display font-semibold tabular-nums text-ink sm:px-3 sm:py-1">
          {seconds}s
        </span>
      )}
    </div>
  );
}
