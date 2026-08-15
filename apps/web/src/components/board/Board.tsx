import { memo, useMemo, useRef } from "react";
import {
  COLORS,
  coordForMode,
  getBoardConfig,
  homeCoordMode,
  isSafeCellMode,
  pathStepCoordsMode,
  type BoardMode,
  type Color,
  type Coord,
  type PawnShape,
  type PlayerPublic,
} from "@chowka/shared";
import { COLOR_THEME } from "../../lib/colors";
import { zoneBaseFill } from "../../lib/boardZones";
import type { TravelAnim } from "../../lib/useTravelAnimation";
import { InnerEntryArrows } from "./InnerEntryArrow";
import { SafeHouse } from "./SafeHouse";

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

export const Board = memo(function Board({
  players,
  activePlayerId,
  orientFor = null,
  boardMode = "7x7",
  className = "",
  selectable = null,
  onPawnClick,
  travel = null,
  previewDest = null,
  selectedPawn = null,
  onDestClick,
}: {
  players: PlayerPublic[];
  activePlayerId?: string | null;
  /** Phone view: rotate so this player's home faces the bottom of the screen. */
  orientFor?: Color | null;
  boardMode?: BoardMode;
  className?: string;
  /** Pawns that can be tapped to move (your valid moves). */
  selectable?: { playerId: string; pawnIndexes: number[] } | null;
  onPawnClick?: (pawnIndex: number) => void;
  /** Active path-walk animation for all clients. */
  travel?: TravelAnim | null;
  /** Landing cell to highlight after selecting a pawn (row, col). */
  previewDest?: Coord | null;
  /** Pawn currently chosen for move preview. */
  selectedPawn?: { playerId: string; pawnIndex: number } | null;
  /** Confirm move by tapping the highlighted destination. */
  onDestClick?: () => void;
}) {
  const cfg = getBoardConfig(boardMode);
  const BOARD_SIZE = cfg.boardSize;
  const CENTER_INDEX = cfg.centerIndex;
  const CENTER_RC = (BOARD_SIZE - 1) / 2;
  const rotation = orientFor ? ORIENT_DEG[orientFor] : 0;
  const livePlayers = useMemo(() => players.filter((p) => !p.left), [players]);
  const activeColorKey = useMemo(() => {
    const set = new Set<Color>();
    for (const p of livePlayers) {
      if (p.color) set.add(p.color);
    }
    return COLORS.filter((c) => set.has(c)).join(",");
  }, [livePlayers]);
  const activeColors = useMemo(() => {
    const set = new Set<Color>();
    for (const part of activeColorKey.split(",")) {
      if (part) set.add(part as Color);
    }
    return set;
  }, [activeColorKey]);

  const selectableSet = useMemo(
    () => new Set(selectable?.pawnIndexes ?? []),
    [selectable],
  );
  const selectablePlayerId = selectable?.playerId ?? null;
  const canSelect = (playerId: string, pawnIndex: number) =>
    Boolean(selectablePlayerId === playerId && selectableSet.has(pawnIndex));

  const pathCoords =
    travel != null
      ? pathStepCoordsMode(boardMode, travel.color, travel.from, travel.to)
      : [];
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

  const previewKey = previewDest ? cellKey(previewDest[0], previewDest[1]) : null;
  const previewColor = selectedPawn
    ? (livePlayers.find((p) => p.id === selectedPawn.playerId)?.color as Color | null | undefined)
    : null;
  const previewTheme = previewColor ? COLOR_THEME[previewColor] : null;

  const travelKey = travel
    ? `${travel.playerId}:${travel.pawnIndex}:${travel.from}:${travel.to}`
    : null;
  const prevPlayersRef = useRef(players);
  const holdCapturesRef = useRef<Map<string, number[]>>(new Map());
  const holdKeyRef = useRef<string | null>(null);
  if (travel && !travel.landed) {
    if (holdKeyRef.current !== travelKey) {
      holdCapturesRef.current = new Map(
        prevPlayersRef.current.map((p) => [p.id, p.pawns.slice()]),
      );
      holdKeyRef.current = travelKey;
    }
  } else {
    holdKeyRef.current = null;
    prevPlayersRef.current = players;
  }

  const byCell = new Map<string, TokenRef[]>();
  for (const p of livePlayers) {
    if (!p.color) continue;
    const color = p.color as Color;
    const held = travel && !travel.landed ? holdCapturesRef.current.get(p.id) : undefined;
    p.pawns.forEach((pos, i) => {
      let displayPos = pos;
      if (travel && travel.playerId === p.id && travel.pawnIndex === i) {
        displayPos = travel.stepPos;
      } else if (held && held[i] != null && held[i] !== 0 && pos === 0) {
        displayPos = held[i]!;
      }
      const coord =
        displayPos < 0
          ? homeCoordMode(boardMode, color)
          : coordForMode(boardMode, color, displayPos);
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

  const travelTheme = travel ? COLOR_THEME[travel.color] : null;
  const arrowColors = useMemo(
    () => COLORS.filter((c) => activeColors.has(c)),
    [activeColors],
  );

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
          <StaticGrid
            boardSize={BOARD_SIZE}
            boardMode={boardMode}
            centerRc={CENTER_RC}
            rotation={rotation}
            activeColorKey={activeColorKey}
            activeColor={activeColor}
          />

          <HighlightLayer
            boardSize={BOARD_SIZE}
            currentKey={currentKey}
            destKey={travel?.landed ? destKey : null}
            trailKeys={trailKeys}
            previewKey={previewKey}
            travelHex={travelTheme?.hex ?? null}
            previewHex={previewTheme?.hex ?? null}
          />

          <InnerEntryArrows colors={arrowColors} boardMode={boardMode} />

          <div className="absolute inset-0 z-[2]">
            {tokens.map((t) => {
              const { dx, dy } = clusterOffset(t.idx, t.total);
              const left = (t.c + 0.5) * (100 / BOARD_SIZE) + dx;
              const top = (t.r + 0.5) * (100 / BOARD_SIZE) + dy;
              const finished = t.pos === CENTER_INDEX;
              const selectablePawn = canSelect(t.playerId, t.pawnIndex);
              const isSelected =
                selectedPawn != null &&
                selectedPawn.playerId === t.playerId &&
                selectedPawn.pawnIndex === t.pawnIndex;
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
                      ? isSelected
                        ? `Selected pawn ${t.pawnIndex + 1}`
                        : `Select pawn ${t.pawnIndex + 1}`
                      : `Pawn ${t.pawnIndex + 1}`
                  }
                  onClick={() => {
                    if (selectablePawn && onPawnClick) onPawnClick(t.pawnIndex);
                  }}
                  className={`absolute left-0 top-0 ${
                    selectablePawn
                      ? "pointer-events-auto cursor-pointer active:scale-95"
                      : "pointer-events-none"
                  }`}
                  style={{
                    width: "10%",
                    height: "10%",
                    transform: `translate3d(${left * 10}%, ${top * 10}%, 0) translate(-50%, -50%)`,
                    transition: isTraveling ? "transform 140ms linear" : undefined,
                    zIndex: isSelected ? 9 : selectablePawn ? 8 : finished ? 5 : isTraveling ? 7 : 2,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    willChange: isTraveling ? "transform" : undefined,
                  }}
                >
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="relative h-[70%] w-[70%]">
                      <PawnToken
                        color={t.color}
                        shape={t.shape}
                        tokenKey={t.key}
                        finished={finished}
                        selected={isSelected}
                        rotation={rotation}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {previewDest && onDestClick && (
            <button
              type="button"
              aria-label="Confirm move to highlighted square"
              onClick={onDestClick}
              className="absolute z-[10] cursor-pointer rounded-sm active:opacity-80"
              style={{
                left: `${(previewDest[1] / BOARD_SIZE) * 100}%`,
                top: `${(previewDest[0] / BOARD_SIZE) * 100}%`,
                width: `${100 / BOARD_SIZE}%`,
                height: `${100 / BOARD_SIZE}%`,
                background: "transparent",
                border: "none",
                padding: 0,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
});

const StaticGrid = memo(function StaticGrid({
  boardSize,
  boardMode,
  centerRc,
  rotation,
  activeColorKey,
  activeColor,
}: {
  boardSize: number;
  boardMode: BoardMode;
  centerRc: number;
  rotation: number;
  activeColorKey: string;
  activeColor: Color | null;
}) {
  const homeByCell = new Map<string, Color>();
  for (const part of activeColorKey.split(",")) {
    if (!part) continue;
    const color = part as Color;
    const [r, c] = homeCoordMode(boardMode, color);
    homeByCell.set(cellKey(r, c), color);
  }
  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      cells.push({ r, c });
    }
  }

  return (
    <div
      className="absolute inset-0 grid"
      style={{
        gap: 0,
        border: "2.5px solid #1a1208",
        gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
        gridTemplateRows: `repeat(${boardSize}, 1fr)`,
      }}
    >
      {cells.map(({ r, c }) => {
        const safe = isSafeCellMode(boardMode, [r, c]);
        const isCenter = r === centerRc && c === centerRc;
        const k = cellKey(r, c);
        const homeColor = homeByCell.get(k) ?? null;
        const homeTheme = homeColor ? COLOR_THEME[homeColor] : null;
        const isActiveHome = homeColor != null && homeColor === activeColor;
        const bg = zoneBaseFill(r, c, safe, isCenter, boardMode);
        const centerGlow = isCenter
          ? "inset 0 0 10px rgba(212,160,23,0.55), inset 0 0 0 2px rgba(184,134,11,0.85)"
          : undefined;

        return (
          <div
            key={k}
            className="relative flex items-center justify-center"
            style={{
              background: bg,
              borderRight: c < boardSize - 1 ? "2.5px solid #1a1208" : undefined,
              borderBottom: r < boardSize - 1 ? "2.5px solid #1a1208" : undefined,
              boxShadow: centerGlow,
            }}
          >
            {isActiveHome && homeTheme && (
              <div
                className="pointer-events-none absolute inset-0 animate-pulseSoft"
                style={{ background: `${homeTheme.hex}55` }}
                aria-hidden="true"
              />
            )}
            {safe && (
              <div className="relative z-[1] flex h-full w-full items-center justify-center">
                <SafeHouse
                  color={homeTheme ? homeTheme.hex : "#000000"}
                  heavy={isCenter}
                  rotation={rotation}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

const HighlightLayer = memo(function HighlightLayer({
  boardSize,
  currentKey,
  destKey,
  trailKeys,
  previewKey,
  travelHex,
  previewHex,
}: {
  boardSize: number;
  currentKey: string | null;
  destKey: string | null;
  trailKeys: Set<string>;
  previewKey: string | null;
  travelHex: string | null;
  previewHex: string | null;
}) {
  const keys = new Set<string>();
  if (currentKey) keys.add(currentKey);
  if (destKey) keys.add(destKey);
  if (previewKey) keys.add(previewKey);
  for (const k of trailKeys) keys.add(k);
  if (keys.size === 0) return null;

  return (
    // Mirrors StaticGrid's tracks and border box exactly so highlights land on
    // the same pixels as the cells beneath them.
    <div
      className="pointer-events-none absolute inset-0 z-[1] grid"
      style={{
        gap: 0,
        border: "2.5px solid transparent",
        gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
        gridTemplateRows: `repeat(${boardSize}, 1fr)`,
      }}
      aria-hidden="true"
    >
      {[...keys].map((k) => {
        const [rs, cs] = k.split("-");
        const r = Number(rs);
        const c = Number(cs);
        const isCurrent = currentKey === k;
        const isDest = destKey === k;
        const isTrail = trailKeys.has(k);
        const isPreview = previewKey === k;
        const hex = isPreview ? previewHex : travelHex;
        if (!hex) return null;
        // Tints only — an opaque stop would repaint the cell's zone color.
        const bg = isDest
          ? `linear-gradient(180deg, ${hex}aa 0%, ${hex}66 100%)`
          : isCurrent
            ? `linear-gradient(180deg, ${hex}99 0%, ${hex}55 100%)`
            : isPreview
              ? `linear-gradient(180deg, ${hex}bb 0%, ${hex}66 100%)`
              : isTrail
                ? `linear-gradient(180deg, ${hex}55 0%, ${hex}18 100%)`
                : undefined;
        const pulses = isCurrent || isDest || isPreview;
        return (
          <div
            key={k}
            className="relative"
            style={{
              gridColumn: c + 1,
              gridRow: r + 1,
              background: bg,
              borderRight: c < boardSize - 1 ? "2.5px solid #1a1208" : undefined,
              borderBottom: r < boardSize - 1 ? "2.5px solid #1a1208" : undefined,
              boxShadow: isCurrent || isDest
                ? `inset 0 0 0 2.5px ${hex}`
                : isPreview
                  ? `inset 0 0 0 3px ${hex}`
                  : undefined,
            }}
          >
            {pulses && (
              <div
                className="absolute inset-0 animate-pulseSoft"
                style={{ background: `${hex}44` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

const SELECT_STROKE = "#2ec4b6";

const PawnToken = memo(function PawnToken({
  color,
  shape,
  tokenKey,
  finished,
  selected = false,
  rotation = 0,
}: {
  color: Color;
  shape: PawnShape;
  tokenKey: string;
  finished?: boolean;
  selected?: boolean;
  /** Board rotation (deg) — cancelled for oriented shapes so they stay upright. */
  rotation?: number;
}) {
  const theme = COLOR_THEME[color];
  const OUTLINE = "#000000";
  void tokenKey;
  const keepUpright = shape === "triangle" || shape === "star";
  const upright =
    keepUpright && rotation ? { transform: `rotate(${-rotation}deg)` } : undefined;
  return (
    <div
      className="relative h-full w-full"
      style={{
        // drop-shadow follows the token silhouette; box-shadow would draw a box.
        filter: finished
          ? `drop-shadow(0 0 6px ${theme.hex})`
          : "drop-shadow(0 2px 3px rgba(26,18,8,0.45))",
        ...upright,
      }}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
        {selected && shape === "circle" && (
          <circle
            cx="20"
            cy="20"
            r="16.75"
            fill="none"
            stroke={SELECT_STROKE}
            strokeWidth="2.75"
          />
        )}
        {selected && shape === "square" && (
          <rect
            x="4.5"
            y="4.5"
            width="31"
            height="31"
            rx="5"
            fill="none"
            stroke={SELECT_STROKE}
            strokeWidth="2.75"
          />
        )}
        {selected && shape === "triangle" && (
          <path
            d="M20 5 L34.5 34.5 L5.5 34.5 Z"
            fill="none"
            stroke={SELECT_STROKE}
            strokeWidth="2.75"
            strokeLinejoin="round"
          />
        )}
        {selected && shape === "star" && (
          <path
            d="M20 1 L25.2 14 L39 14.4 L28 22.5 L31.8 36 L20 28.5 L8.2 36 L12 22.5 L1 14.4 L14.8 14 Z"
            fill="none"
            stroke={SELECT_STROKE}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        )}
        {shape === "circle" && (
          <circle
            cx="20"
            cy="20"
            r="14"
            fill={theme.hex}
            stroke={OUTLINE}
            strokeWidth="2.5"
          />
        )}
        {shape === "square" && (
          <rect
            x="7"
            y="7"
            width="26"
            height="26"
            rx="4"
            fill={theme.hex}
            stroke={OUTLINE}
            strokeWidth="2.5"
          />
        )}
        {shape === "triangle" && (
          <path
            d="M20 8 L32 33 L8 33 Z"
            fill={theme.hex}
            stroke={OUTLINE}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        )}
        {shape === "star" && (
          <path
            d="M20 4 L24.2 15 L36 15.3 L26.5 22.5 L29.8 34 L20 27.5 L10.2 34 L13.5 22.5 L4 15.3 L15.8 15 Z"
            fill={theme.hex}
            stroke={OUTLINE}
            strokeWidth="2.25"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
});

/** Small legend of each player's pocket (un-entered) and finished pawns. */
export function Pockets({
  players,
  boardMode = "7x7",
}: {
  players: PlayerPublic[];
  boardMode?: BoardMode;
}) {
  const center = getBoardConfig(boardMode).centerIndex;
  return (
    <div className="flex flex-wrap gap-2">
      {players
        .filter((p) => p.color && !p.left)
        .map((p) => {
          const theme = COLOR_THEME[p.color as Color];
          const atBase = p.pawns.filter((x) => x < 0).length;
          const home = p.pawns.filter((x) => x === center).length;
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
