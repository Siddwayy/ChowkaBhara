import { useCountdown } from "../../lib/useGameSocket";

export function StatusStrip({
  turnName,
  isMyTurn = false,
  roll,
  phaseEndsAt = null,
}: {
  turnName?: string | null;
  isMyTurn?: boolean;
  roll?: number | null;
  phaseEndsAt?: number | null;
}) {
  const seconds = useCountdown(phaseEndsAt);
  const showTimer = seconds > 0;

  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-1.5 rounded-xl bg-surface/15 px-2.5 py-1.5 text-xs text-surface backdrop-blur-sm sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-sm">
      {turnName != null && (
        <span
          className={`rounded-full px-2.5 py-0.5 font-display font-semibold sm:px-3 sm:py-1 ${
            isMyTurn ? "bg-o2 text-ink" : "bg-surface/25 text-surface"
          }`}
        >
          {isMyTurn ? "Your turn" : `${turnName}'s turn`}
        </span>
      )}
      {/* Always reserve roll + timer chips so the strip stays stable */}
      <span
        className={`rounded-full bg-warn px-2.5 py-0.5 font-display font-semibold tabular-nums text-ink sm:px-3 sm:py-1 ${
          roll != null ? "" : "invisible"
        }`}
        aria-hidden={roll == null}
      >
        Roll {roll ?? 0}
      </span>
      <span
        className={`ml-auto rounded-full bg-surface px-2.5 py-0.5 font-display font-semibold tabular-nums text-ink sm:px-3 sm:py-1 ${
          showTimer ? "" : "invisible"
        }`}
        aria-hidden={!showTimer}
      >
        {showTimer ? `${seconds}s` : "0s"}
      </span>
    </div>
  );
}

/** Isolated 1 Hz countdown so parent trees (board) do not re-render. */
export function PhaseCountdown({
  phaseEndsAt,
  className = "mt-3 text-center text-sm text-surface/50",
}: {
  phaseEndsAt: number | null;
  className?: string;
}) {
  const seconds = useCountdown(phaseEndsAt);
  if (seconds <= 0) return null;
  return <p className={className}>{seconds}s</p>;
}
