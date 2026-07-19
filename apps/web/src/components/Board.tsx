import {
  BOARD_SIZE,
  CENTER_INDEX,
  COLORS,
  POCKET,
  coordFor,
  homeCoord,
  isSafeCell,
  type Color,
  type PlayerPublic,
} from "@chowka/shared";
import { COLOR_THEME } from "../lib/colors";

interface TokenRef {
  key: string;
  color: Color;
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
  // For 2: opposite corners of diamond; for 3–4: fill diamond.
  const order = total === 2 ? [0, 1] : [0, 2, 3, 1];
  const slot = slots[order[index % order.length]!]!;
  return { dx: slot.dx * spread, dy: slot.dy * spread };
}

/** Degrees to rotate the board so this color's home sits at the bottom. */
const ORIENT_DEG: Record<Color, number> = {
  red: 0,
  blue: 90, // left home → bottom
  green: 180, // top home → bottom
  yellow: 270, // right home → bottom
};

export function Board({
  players,
  activePlayerId,
  orientFor = null,
  className = "",
}: {
  players: PlayerPublic[];
  activePlayerId?: string | null;
  /** Phone view: rotate so this player's home faces the bottom of the screen. */
  orientFor?: Color | null;
  className?: string;
}) {
  const rotation = orientFor ? ORIENT_DEG[orientFor] : 0;
  // Eliminated players vanish from the board (pawns + home X).
  const livePlayers = players.filter((p) => !p.left);
  const activeColors = new Set(
    livePlayers.map((p) => p.color).filter(Boolean) as Color[],
  );

  // Map each home cell -> owning color (only colors seated in this game).
  const homeByCell = new Map<string, Color>();
  for (const color of COLORS) {
    if (!activeColors.has(color)) continue;
    const [r, c] = homeCoord(color);
    homeByCell.set(cellKey(r, c), color);
  }

  // Gather tokens per cell — pocket pawns sit on their home square.
  const byCell = new Map<string, TokenRef[]>();
  for (const p of livePlayers) {
    if (!p.color) continue;
    const color = p.color as Color;
    p.pawns.forEach((pos, i) => {
      let coord = pos < 0 ? homeCoord(color) : coordFor(color, pos);
      if (!coord) return;
      const ref: TokenRef = { key: `${p.id}-${i}`, color, pos };
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
      {/* Subtle wood grain overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-multiply"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0px, transparent 11px, rgba(90,55,20,0.07) 11px, rgba(90,55,20,0.07) 12px), repeating-linear-gradient(0deg, transparent 0px, transparent 47px, rgba(60,35,10,0.05) 47px, rgba(60,35,10,0.05) 48px)",
        }}
        aria-hidden="true"
      />

      {/* Decorative inner frame — rotate so viewer's home faces them */}
      <div
        className="relative rounded-lg border-[3px] border-[#3d2a12]/70 p-1.5 transition-transform duration-500"
        style={{
          boxShadow: "inset 0 0 0 2px rgba(244,228,200,0.45)",
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#e8d4b0]">
          {/* Tile grid — no cell padding so overlay centers match */}
          <div
            className="absolute inset-0 grid grid-cols-5 grid-rows-5"
            style={{
              gap: 0,
              border: "2.5px solid #1a1208",
            }}
          >
            {cells.map(({ r, c }) => {
              const safe = isSafeCell([r, c]);
              const isCenter = r === 2 && c === 2;
              const homeColor = homeByCell.get(cellKey(r, c)) ?? null;
              const homeTheme = homeColor ? COLOR_THEME[homeColor] : null;
              const isActiveHome =
                homeColor != null && homeColor === activeColor;

              let crossColor = "#1a1208";
              if (isCenter) {
                crossColor = "#1a1208";
              } else if (homeTheme) {
                crossColor = homeTheme.hex;
              } else if (safe) {
                crossColor = "#3d2a12";
              }

              return (
                <div
                  key={cellKey(r, c)}
                  className={`relative flex items-center justify-center ${
                    isActiveHome ? "animate-pulseGlow" : ""
                  }`}
                  style={{
                    background:
                      "linear-gradient(180deg, #f0e0c4 0%, #e2cb9e 100%)",
                    borderRight: c < BOARD_SIZE - 1 ? "2.5px solid #1a1208" : undefined,
                    borderBottom: r < BOARD_SIZE - 1 ? "2.5px solid #1a1208" : undefined,
                  }}
                >
                  {safe && <SafeCross color={crossColor} heavy={isCenter} />}
                </div>
              );
            })}
          </div>

          {/* Pawn overlay — centers = (col+0.5)/5 and (row+0.5)/5 of the grid */}
          <div className="pointer-events-none absolute inset-0">
            {tokens.map((t) => {
              const { dx, dy } = clusterOffset(t.idx, t.total);
              const left = (t.c + 0.5) * (100 / BOARD_SIZE) + dx;
              const top = (t.r + 0.5) * (100 / BOARD_SIZE) + dy;
              const finished = t.pos === CENTER_INDEX;
              return (
                <div
                  key={t.key}
                  className="absolute transition-all duration-500 ease-out"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: "9%",
                    height: "9%",
                    transform: "translate(-50%, -50%)",
                    zIndex: finished ? 5 : 2,
                  }}
                >
                  <PawnDisc color={t.color} finished={finished} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Classic board X mark spanning most of the cell. */
function SafeCross({ color, heavy = false }: { color: string; heavy?: boolean }) {
  const stroke = heavy ? 3.2 : 2.6;
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-[78%] w-[78%]"
      aria-hidden="true"
    >
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

/** Checker / coin-style pawn disc with inner ring. */
function PawnDisc({ color, finished }: { color: Color; finished?: boolean }) {
  const theme = COLOR_THEME[color];
  return (
    <div
      className="relative h-full w-full"
      style={{
        filter: finished
          ? `drop-shadow(0 0 6px ${theme.hex})`
          : "drop-shadow(0 2px 3px rgba(26,18,8,0.45))",
      }}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id={`pawn-face-${color}`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor={theme.hex} stopOpacity="1" />
            <stop offset="70%" stopColor={theme.hex} />
            <stop offset="100%" stopColor={theme.edge} />
          </radialGradient>
        </defs>
        {/* Outer rim */}
        <circle cx="20" cy="20" r="18.5" fill={theme.edge} />
        {/* Face */}
        <circle cx="20" cy="20" r="16.5" fill={`url(#pawn-face-${color})`} />
        {/* Inner ring indent (classic disc look) */}
        <circle
          cx="20"
          cy="20"
          r="9"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="2.2"
        />
        <circle
          cx="20"
          cy="20"
          r="9"
          fill="none"
          stroke="rgba(0,0,0,0.22)"
          strokeWidth="1.2"
          strokeDasharray="0"
          transform="translate(0.4 0.6)"
        />
        {/* Specular highlight */}
        <ellipse
          cx="14"
          cy="12"
          rx="5"
          ry="3.2"
          fill="rgba(255,255,255,0.35)"
        />
      </svg>
    </div>
  );
}

/** Small legend of each player's pocket (un-entered) and finished pawns. */
export function Pockets({ players }: { players: PlayerPublic[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {players
        .filter((p) => p.color)
        .map((p) => {
          const theme = COLOR_THEME[p.color as Color];
          const pocket = p.pawns.filter((x) => x === POCKET || x === 0).length;
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
                base {pocket} · home {home}
              </span>
            </div>
          );
        })}
    </div>
  );
}
