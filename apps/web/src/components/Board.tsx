import {
  BOARD_SIZE,
  CENTER_INDEX,
  COLORS,
  coordFor,
  homeCoord,
  isSafeCell,
  pathStepCoords,
  type Color,
  type PawnShape,
  type PlayerPublic,
} from "@chowka/shared";
import { COLOR_THEME } from "../lib/colors";
import type { TravelAnim } from "../lib/useTravelAnimation";

interface TokenRef {
  key: string;
  playerId: string;
  pawnIndex: number;
  color: Color;
  shape: PawnShape;
  pos: number;
}

function cellKey(r: number, c: number): string {
  return `${r}-${c}`;
}

/**
 * Tight diamond offsets (board %) for stacked pawns. Single pawn uses no offset
 * so it sits exactly on the cell center.
 */
function clusterOffset(index: number, total: number): { dx: number; dy: number } {
  if (total <= 1) return { dx: 0, dy: 0 };
  const spread = total <= 2 ? 2.2 : 2.6;
  const slots = [
    { dx: -1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
  ];
  const order = total === 2 ? [0, 1] : [0, 2, 3, 1];
  const slot = slots[order[index % order.length]!]!;
  return { dx: slot.dx * spread, dy: slot.dy * spread };
}

/** Degrees to rotate the board so this color's home sits at the bottom. */
const ORIENT_DEG: Record<Color, number> = {
  red: 0,
  blue: 270,
  green: 180,
  yellow: 90,
};

export function Board({
  players,
  activePlayerId,
  orientFor = null,
  className = "",
  selectable = null,
  onPawnClick,
  travel = null,
}: {
  players: PlayerPublic[];
  activePlayerId?: string | null;
  /** Phone view: rotate so this player's home faces the bottom of the screen. */
  orientFor?: Color | null;
  className?: string;
  /** Pawns that can be tapped to move (your valid moves). */
  selectable?: { playerId: string; pawnIndexes: number[] } | null;
  onPawnClick?: (pawnIndex: number) => void;
  /** Active path-walk animation for all clients. */
  travel?: TravelAnim | null;
}) {
  const rotation = orientFor ? ORIENT_DEG[orientFor] : 0;
  const livePlayers = players.filter((p) => !p.left);
  const activeColors = new Set(
    livePlayers.map((p) => p.color).filter(Boolean) as Color[],
  );

  const selectableSet = new Set(selectable?.pawnIndexes ?? []);
  const canSelect = (playerId: string, pawnIndex: number) =>
    Boolean(selectable && selectable.playerId === playerId && selectableSet.has(pawnIndex));

  const homeByCell = new Map<string, Color>();
  for (const color of COLORS) {
    if (!activeColors.has(color)) continue;
    const [r, c] = homeCoord(color);
    homeByCell.set(cellKey(r, c), color);
  }

  // Path cells for travel highlight
  const pathCoords =
    travel != null ? pathStepCoords(travel.color, travel.from, travel.to) : [];
  const trailKeys = new Set<string>();
  const currentKey =
    travel && travel.revealedSteps > 0 && pathCoords[travel.revealedSteps - 1]
      ? cellKey(
          pathCoords[travel.revealedSteps - 1]![0],
          pathCoords[travel.revealedSteps - 1]![1],
        )
      : null;
  for (let i = 0; i < (travel?.revealedSteps ?? 0) - 1; i++) {
    const c = pathCoords[i];
    if (c) trailKeys.add(cellKey(c[0], c[1]));
  }
  const destKey =
    travel && pathCoords.length > 0
      ? cellKey(pathCoords[pathCoords.length - 1]![0], pathCoords[pathCoords.length - 1]![1])
      : null;

  // Gather tokens per cell — traveling pawn uses stepPos instead of server pos.
  const byCell = new Map<string, TokenRef[]>();
  for (const p of livePlayers) {
    if (!p.color) continue;
    const color = p.color as Color;
    p.pawns.forEach((pos, i) => {
      let displayPos = pos;
      if (
        travel &&
        travel.playerId === p.id &&
        travel.pawnIndex === i
      ) {
        displayPos = travel.stepPos;
      }
      const coord =
        displayPos < 0 ? homeCoord(color) : coordFor(color, displayPos);
      if (!coord) return;
      const ref: TokenRef = {
        key: `${p.id}-${i}`,
        playerId: p.id,
        pawnIndex: i,
        color,
        shape: (p.shape ?? "circle") as PawnShape,
        pos: displayPos,
      };
      const k = cellKey(coord[0], coord[1]);
      const list = byCell.get(k) ?? [];
      list.push(ref);
      byCell.set(k, list);
    });
  }

  const tokens: (TokenRef & { r: number; c: number; idx: number; total: number })[] =
    [];
  for (const [k, list] of byCell) {
    const [rs, cs] = k.split("-");
    const r = Number(rs);
    const c = Number(cs);
    list.forEach((ref, idx) => {
      tokens.push({ ...ref, r, c, idx, total: list.length });
    });
  }

  const activeColor =
    players.find((p) => p.id === activePlayerId)?.color ?? null;

  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      cells.push({ r, c });
    }
  }

  const travelTheme = travel ? COLOR_THEME[travel.color] : null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-3 shadow-card sm:p-4 ${className}`}
      style={{
        background:
          "linear-gradient(145deg, #d4b896 0%, #c4a574 35%, #a67c3d 70%, #8b6914 100%)",
        boxShadow:
          "0 10px 28px rgba(11,31,58,0.35), inset 0 1px 0 rgba(255,255,255,0.35)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-multiply"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0px, transparent 11px, rgba(90,55,20,0.07) 11px, rgba(90,55,20,0.07) 12px), repeating-linear-gradient(0deg, transparent 0px, transparent 47px, rgba(60,35,10,0.05) 47px, rgba(60,35,10,0.05) 48px)",
        }}
        aria-hidden="true"
      />

      <div
        className="relative rounded-lg border-[3px] border-[#3d2a12]/70 p-1.5 transition-transform duration-500"
        style={{
          boxShadow: "inset 0 0 0 2px rgba(244,228,200,0.45)",
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#e8d4b0]">
          <div
            className="absolute inset-0 grid grid-cols-5 grid-rows-5"
            style={{ gap: 0, border: "2.5px solid #1a1208" }}
          >
            {cells.map(({ r, c }) => {
              const safe = isSafeCell([r, c]);
              const isCenter = r === 2 && c === 2;
              const homeColor = homeByCell.get(cellKey(r, c)) ?? null;
              const homeTheme = homeColor ? COLOR_THEME[homeColor] : null;
              const isActiveHome =
                homeColor != null && homeColor === activeColor;
              const k = cellKey(r, c);
              const isCurrent = currentKey === k;
              const isTrail = trailKeys.has(k);
              const isDestLand = travel?.landed && destKey === k;

              let crossColor = "#1a1208";
              if (isCenter) crossColor = "#B8860B";
              else if (homeTheme) crossColor = homeTheme.hex;
              else if (safe) crossColor = "#3d2a12";

              let bg = "linear-gradient(180deg, #f0e0c4 0%, #e2cb9e 100%)";
              if (isDestLand && travelTheme) {
                bg = `linear-gradient(180deg, ${travelTheme.hex}aa 0%, ${travelTheme.hex}66 100%)`;
              } else if (isCurrent && travelTheme) {
                bg = `linear-gradient(180deg, ${travelTheme.hex}99 0%, ${travelTheme.hex}55 100%)`;
              } else if (isTrail && travelTheme) {
                bg = `linear-gradient(180deg, ${travelTheme.hex}44 0%, #e2cb9e 100%)`;
              } else if (isCenter) {
                bg = "linear-gradient(160deg, #FFE9A8 0%, #F5C842 45%, #D4A017 100%)";
              }

              const travelRing =
                isCurrent || isDestLand
                  ? `inset 0 0 0 2.5px ${travelTheme?.hex ?? "#FFB020"}`
                  : undefined;
              const centerGlow = isCenter
                ? "inset 0 0 10px rgba(212,160,23,0.55), inset 0 0 0 2px rgba(184,134,11,0.85)"
                : undefined;

              return (
                <div
                  key={k}
                  className={`relative flex items-center justify-center transition-colors duration-150 ${
                    isActiveHome ? "animate-pulseGlow" : ""
                  } ${isCurrent || isDestLand ? "animate-pulseGlow" : ""}`}
                  style={{
                    background: bg,
                    borderRight: c < BOARD_SIZE - 1 ? "2.5px solid #1a1208" : undefined,
                    borderBottom: r < BOARD_SIZE - 1 ? "2.5px solid #1a1208" : undefined,
                    boxShadow: travelRing ?? centerGlow,
                  }}
                >
                  {safe && <SafeCross color={crossColor} heavy={isCenter} />}
                </div>
              );
            })}
          </div>

          {/* Pawns — selectable ones receive clicks */}
          <div className="absolute inset-0 z-[2]">
            {tokens.map((t) => {
              const { dx, dy } = clusterOffset(t.idx, t.total);
              const left = (t.c + 0.5) * (100 / BOARD_SIZE) + dx;
              const top = (t.r + 0.5) * (100 / BOARD_SIZE) + dy;
              const finished = t.pos === CENTER_INDEX;
              const selectablePawn = canSelect(t.playerId, t.pawnIndex);
              const isTraveling =
                travel != null &&
                travel.playerId === t.playerId &&
                travel.pawnIndex === t.pawnIndex;

              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={!selectablePawn}
                  aria-label={
                    selectablePawn
                      ? `Move pawn ${t.pawnIndex + 1}`
                      : `Pawn ${t.pawnIndex + 1}`
                  }
                  onClick={() => {
                    if (selectablePawn && onPawnClick) onPawnClick(t.pawnIndex);
                  }}
                  className={`absolute ${
                    selectablePawn
                      ? "pointer-events-auto cursor-pointer active:scale-95"
                      : "pointer-events-none"
                  } ${isTraveling ? "transition-all duration-200 ease-out" : "transition-all duration-300 ease-out"}`}
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    // Larger hit target on phones; visual token stays ~70% inside.
                    width: selectablePawn ? "20%" : "14%",
                    height: selectablePawn ? "20%" : "14%",
                    transform: "translate(-50%, -50%)",
                    zIndex: selectablePawn ? 8 : finished ? 5 : isTraveling ? 7 : 2,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                  }}
                >
                  <div className="flex h-full w-full items-center justify-center">
                    <div className={selectablePawn ? "h-[65%] w-[65%]" : "h-[70%] w-[70%]"}>
                      <PawnToken
                        color={t.color}
                        shape={t.shape}
                        tokenKey={t.key}
                        finished={finished}
                        selectable={selectablePawn}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SafeCross({ color, heavy = false }: { color: string; heavy?: boolean }) {
  const stroke = heavy ? 7.5 : 6;
  return (
    <svg viewBox="0 0 100 100" className="h-[82%] w-[82%]" aria-hidden="true">
      <line
        x1="14"
        y1="14"
        x2="86"
        y2="86"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <line
        x1="86"
        y1="14"
        x2="14"
        y2="86"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

function PawnToken({
  color,
  shape,
  tokenKey,
  finished,
  selectable,
}: {
  color: Color;
  shape: PawnShape;
  tokenKey: string;
  finished?: boolean;
  selectable?: boolean;
}) {
  const theme = COLOR_THEME[color];
  const gradId = `pawn-face-${tokenKey}`;
  return (
    <div
      className={`relative h-full w-full transition-transform ${selectable ? "scale-105" : ""}`}
      style={{
        filter: finished
          ? `drop-shadow(0 0 6px ${theme.hex})`
          : "drop-shadow(0 2px 3px rgba(26,18,8,0.45))",
      }}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor={theme.hex} stopOpacity="1" />
            <stop offset="70%" stopColor={theme.hex} />
            <stop offset="100%" stopColor={theme.edge} />
          </radialGradient>
        </defs>
        {shape === "circle" && (
          <>
            <circle cx="20" cy="20" r="18.5" fill={theme.edge} />
            <circle cx="20" cy="20" r="16.5" fill={`url(#${gradId})`} />
            <ellipse cx="14" cy="12" rx="5" ry="3.2" fill="rgba(255,255,255,0.35)" />
          </>
        )}
        {shape === "square" && (
          <>
            <rect x="3" y="3" width="34" height="34" rx="5" fill={theme.edge} />
            <rect x="5.5" y="5.5" width="29" height="29" rx="4" fill={`url(#${gradId})`} />
            <ellipse cx="14" cy="13" rx="4.5" ry="3" fill="rgba(255,255,255,0.35)" />
          </>
        )}
        {shape === "triangle" && (
          <>
            <path d="M20 3 L37 35 L3 35 Z" fill={theme.edge} />
            <path d="M20 8 L33 33 L7 33 Z" fill={`url(#${gradId})`} />
            <ellipse cx="17" cy="18" rx="3.5" ry="2.4" fill="rgba(255,255,255,0.35)" />
          </>
        )}
        {shape === "star" && (
          <>
            <path
              d="M20 2.5 L24.5 14.2 L37 14.5 L27 22.2 L30.5 34.5 L20 27.5 L9.5 34.5 L13 22.2 L3 14.5 L15.5 14.2 Z"
              fill={theme.edge}
            />
            <path
              d="M20 6 L23.6 15.5 L33.5 15.7 L25.5 21.8 L28.2 31.5 L20 26 L11.8 31.5 L14.5 21.8 L6.5 15.7 L16.4 15.5 Z"
              fill={`url(#${gradId})`}
            />
            <ellipse cx="17" cy="14" rx="3.2" ry="2.2" fill="rgba(255,255,255,0.35)" />
          </>
        )}
      </svg>
    </div>
  );
}

/** Small legend of each player's pocket (un-entered) and finished pawns. */
export function Pockets({ players }: { players: PlayerPublic[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {players
        .filter((p) => p.color && !p.left)
        .map((p) => {
          const theme = COLOR_THEME[p.color as Color];
          const atBase = p.pawns.filter((x) => x <= 0).length;
          const home = p.pawns.filter((x) => x === CENTER_INDEX).length;
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-2xl bg-surface/10 px-3 py-2"
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full ring-2 ring-white/40"
                style={{ background: theme.hex }}
              />
              <span className="font-display text-sm font-medium text-surface">
                {p.name}
              </span>
              <span className="text-xs text-surface/70">
                base {atBase} · home {home}
              </span>
            </div>
          );
        })}
    </div>
  );
}
