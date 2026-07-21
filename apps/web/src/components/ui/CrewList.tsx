import { PAWNS_PER_PLAYER, type Phase, type PlayerPublic } from "@chowka/shared";
import { colorTheme } from "../../lib/colors";

function badgeFor(
  p: PlayerPublic,
  phase: Phase | string,
  activePlayerId?: string | null,
): { label: string; className: string } {
  if (!p.connected) return { label: "Offline", className: "bg-ink-faint/30 text-surface/60" };
  if (p.left) return { label: "Left", className: "bg-ink-faint/30 text-surface/60" };
  if (phase === "lobby") {
    return p.ready
      ? { label: "Ready", className: "bg-o2/25 text-o2-light" }
      : { label: "Waiting", className: "bg-warn/20 text-warn" };
  }
  if (phase === "endgame") {
    return {
      label: `${p.finishedCount ?? 0}/${PAWNS_PER_PLAYER} home`,
      className: "bg-surface/20 text-surface",
    };
  }
  if (p.id === activePlayerId) {
    return { label: "Turn", className: "bg-o2/30 text-o2-light" };
  }
  return {
    label: `${p.finishedCount ?? 0}/${PAWNS_PER_PLAYER}`,
    className: "bg-surface/15 text-surface/80",
  };
}

export function CrewList({
  players,
  phase,
  myPlayerId,
  activePlayerId,
}: {
  players: PlayerPublic[];
  phase: Phase | string;
  myPlayerId?: string;
  activePlayerId?: string | null;
}) {
  return (
    <ul className="space-y-2">
      {players.map((p) => {
        const badge = badgeFor(p, phase, activePlayerId);
        const theme = colorTheme(p.color);
        const isActive = p.id === activePlayerId && phase !== "lobby" && phase !== "endgame";
        return (
          <li
            key={p.id}
            className={`flex items-center justify-between gap-3 rounded-2xl bg-surface/10 px-3 py-3 ${
              isActive ? "ring-2 ring-o2/60" : ""
            }`}
          >
            <span className="flex items-center gap-2.5 font-display font-medium text-surface">
              <span
                className="inline-flex h-5 w-5 items-center justify-center"
                style={{
                  background: theme?.hex ?? "#6B8499",
                  border: "1.5px solid #000000",
                  borderRadius:
                    p.shape === "square"
                      ? "4px"
                      : p.shape === "triangle" || p.shape === "star"
                        ? "2px"
                        : "9999px",
                  clipPath:
                    p.shape === "triangle"
                      ? "polygon(50% 8%, 92% 88%, 8% 88%)"
                      : p.shape === "star"
                        ? "polygon(50% 5%, 61% 35%, 95% 35%, 68% 55%, 79% 88%, 50% 70%, 21% 88%, 32% 55%, 5% 35%, 39% 35%)"
                        : undefined,
                }}
                aria-hidden="true"
              />
              {p.name}
              {p.isHost ? " · Host" : ""}
              {p.id === myPlayerId ? " · You" : ""}
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}
            >
              {badge.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
