import { PAWNS_PER_PLAYER, type GameOverResult } from "@chowka/shared";
import { colorTheme } from "../lib/colors";
import { PrimaryButton, SecondaryButton } from "./ui";

export function Scorecard({
  gameOver,
  myPlayerId,
  isHost,
  onRematch,
  onLeave,
  large = false,
}: {
  gameOver: GameOverResult;
  myPlayerId?: string;
  isHost?: boolean;
  onRematch?: () => void;
  onLeave?: () => void;
  large?: boolean;
}) {
  const iWon = myPlayerId != null && gameOver.winnerId === myPlayerId;

  return (
    <div className={`animate-fadeIn ${large ? "max-w-3xl" : ""}`}>
      <div className="rounded-3xl bg-surface px-5 py-8 text-center text-ink shadow-card sm:px-8">
        <p className="font-display text-sm font-semibold uppercase tracking-wider text-ink-faint">
          Game over
        </p>
        <p
          className={`mt-4 font-display font-bold ${large ? "text-5xl" : "text-4xl"} text-o2-dark`}
        >
          {myPlayerId
            ? iWon
              ? "You win!"
              : `${gameOver.winnerName ?? "Someone"} wins`
            : `${gameOver.winnerName ?? "Someone"} wins!`}
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          First to bring all {PAWNS_PER_PLAYER} pawns home.
        </p>

        <div className="mt-8 text-left">
          <p className="font-display text-sm font-semibold uppercase tracking-wider text-ink-faint">
            Final standings
          </p>
          <ol className="mt-3 space-y-2">
            {(gameOver.standings ?? []).map((s, i) => {
              const isMe = s.id === myPlayerId;
              const theme = colorTheme(s.color);
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-2xl bg-surface-muted px-4 py-3"
                >
                  <span className="flex items-center gap-2.5 font-display font-medium">
                    <span className="w-5 text-ink-faint">{i + 1}.</span>
                    <span
                      className="inline-block h-4 w-4 rounded-full ring-2 ring-white/50"
                      style={{ background: theme?.hex ?? "#6B8499" }}
                    />
                    {s.name}
                    {isMe ? " (you)" : ""}
                  </span>
                  <span className="font-display text-sm font-semibold text-o2-dark">
                    {s.finishedCount}/{PAWNS_PER_PLAYER} home
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {(onRematch || onLeave) && (
        <div className="mt-6 space-y-3">
          {isHost && onRematch && <PrimaryButton onClick={onRematch}>Rematch</PrimaryButton>}
          {!isHost && onRematch && (
            <p className="text-center text-sm text-surface/70">Waiting for host to rematch…</p>
          )}
          {onLeave && <SecondaryButton onClick={onLeave}>Leave</SecondaryButton>}
        </div>
      )}
    </div>
  );
}
