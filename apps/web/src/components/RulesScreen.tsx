import {
  COLORS,
  getBoardConfig,
  homeCoordMode,
  isSafeCellMode,
  type BoardMode,
  type Color,
} from "@chowka/shared";
import { COLOR_THEME } from "../lib/colors";
import { zoneBaseFill } from "../lib/boardZones";
import { InnerEntryArrow } from "./InnerEntryArrow";
import { SafeHouse } from "./SafeHouse";
import { PrimaryButton, ShellIcon } from "./ui";

const GAME_LOOP = [
  {
    title: "Throw",
    body: "Throw 4 cowrie shells. Count how many land mouth-up (face up).",
  },
  {
    title: "Move",
    body: "Advance one pawn that many steps along your path.",
  },
  {
    title: "Capture",
    body: "Land on an opponent (off a safe house) → they return home; you roll again.",
  },
  {
    title: "Bonus",
    body: "Roll a 4 or 8 → roll again.",
  },
  {
    title: "Finish",
    body: "Exact roll into the center. First with all 4 home wins.",
  },
];

const SHELL_SCORES = [1, 2, 3, 4, 8] as const;

function cellKey(r: number, c: number): string {
  return `${r}-${c}`;
}

/** Teaching diagram for the active board mode (red's path). */
function RulesPathBoard({ boardMode }: { boardMode: BoardMode }) {
  const cfg = getBoardConfig(boardMode);
  const BOARD_SIZE = cfg.boardSize;
  const CENTER_RC = (BOARD_SIZE - 1) / 2;
  const route = cfg.paths.red;
  const theme = COLOR_THEME.red;
  const cell = 100 / BOARD_SIZE;

  const homeByCell = new Map<string, Color>();
  for (const color of COLORS) {
    const [r, c] = homeCoordMode(boardMode, color);
    homeByCell.set(cellKey(r, c), color);
  }

  const pts = route.map(([r, c]) => ({
    x: (c + 0.5) * cell,
    y: (r + 0.5) * cell,
  }));

  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      cells.push({ r, c });
    }
  }

  const middle = cfg.middleEntryJumps.red;
  const inner = cfg.innerEntryJumps?.red;

  return (
    <div
      className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl p-2.5 shadow-card sm:p-3"
      style={{
        background:
          "linear-gradient(145deg, #d4b896 0%, #c4a574 35%, #a67c3d 70%, #8b6914 100%)",
        boxShadow:
          "0 10px 28px rgba(11,31,58,0.35), inset 0 1px 0 rgba(255,255,255,0.35)",
      }}
      aria-hidden="true"
    >
      <div
        className="relative rounded-lg border-[3px] border-[#3d2a12]/70 p-1.5"
        style={{ boxShadow: "inset 0 0 0 2px rgba(244,228,200,0.45)" }}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#e8d4b0]">
          <div
            className="absolute inset-0 grid"
            style={{
              gap: 0,
              border: "2.5px solid #1a1208",
              gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
            }}
          >
            {cells.map(({ r, c }) => {
              const safe = isSafeCellMode(boardMode, [r, c]);
              const isCenter = r === CENTER_RC && c === CENTER_RC;
              const homeColor = homeByCell.get(cellKey(r, c)) ?? null;
              const homeTheme = homeColor ? COLOR_THEME[homeColor] : null;

              const bg = zoneBaseFill(r, c, safe, isCenter, boardMode);

              return (
                <div
                  key={cellKey(r, c)}
                  className="relative flex items-center justify-center"
                  style={{
                    background: bg,
                    borderRight: c < BOARD_SIZE - 1 ? "2.5px solid #1a1208" : undefined,
                    borderBottom: r < BOARD_SIZE - 1 ? "2.5px solid #1a1208" : undefined,
                    boxShadow: isCenter
                      ? "inset 0 0 10px rgba(212,160,23,0.55), inset 0 0 0 2px rgba(184,134,11,0.85)"
                      : undefined,
                  }}
                >
                  {safe && (
                    <SafeHouse
                      color={homeTheme ? homeTheme.hex : "#000000"}
                      heavy={isCenter}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <InnerEntryArrow
            from={middle.from}
            to={middle.to}
            boardSize={BOARD_SIZE}
            inset={0.18}
          />
          {inner && (
            <InnerEntryArrow
              from={inner.from}
              to={inner.to}
              boardSize={BOARD_SIZE}
            />
          )}

          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
          >
            {pts.slice(0, -1).map((from, i) => (
              <path
                key={`seg-${i}`}
                d={integratedArrowPath(from.x, from.y, pts[i + 1]!.x, pts[i + 1]!.y)}
                fill={theme.edge}
                fillOpacity="0.55"
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Single polygon: shaft + arrowhead as one shape (viewBox units). */
function integratedArrowPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const startPad = len * 0.22;
  const endPad = len * 0.14;
  const sx = x0 + ux * startPad;
  const sy = y0 + uy * startPad;
  const tipX = x1 - ux * endPad;
  const tipY = y1 - uy * endPad;

  const halfW = Math.min(1.15, len * 0.12);
  const headLen = Math.min(2.4, len * 0.38);
  const headHalf = halfW * 2.1;
  const neckX = tipX - ux * headLen;
  const neckY = tipY - uy * headLen;

  const pts: [number, number][] = [
    [sx + px * halfW, sy + py * halfW],
    [sx - px * halfW, sy - py * halfW],
    [neckX - px * halfW, neckY - py * halfW],
    [neckX - px * headHalf, neckY - py * headHalf],
    [tipX, tipY],
    [neckX + px * headHalf, neckY + py * headHalf],
    [neckX + px * halfW, neckY + py * halfW],
  ];

  return (
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") +
    " Z"
  );
}

function ShellThrowGuide() {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs leading-relaxed text-ink-soft">
        Four cowries. Mouth-up count is your move — except all face down scores{" "}
        <strong className="text-ink">8</strong>.
      </p>
      <ul className="space-y-1.5">
        {SHELL_SCORES.map((value) => {
          const openCount = value === 8 ? 0 : value;
          return (
            <li
              key={value}
              className="flex items-center justify-between gap-3 rounded-xl bg-ink/5 px-2.5 py-1.5"
            >
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <ShellIcon key={i} open={i < openCount} px={18} />
                ))}
              </div>
              <span className="shrink-0 font-display text-sm font-bold tabular-nums text-warn">
                {value}
              </span>
              <span className="w-[7.5rem] shrink-0 text-right text-xs text-ink-soft">
                {value === 8 ? "all face down" : `${value} face up`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function rulesStorageKey(code: string): string {
  return `chowka-rules-v1-${code.toUpperCase()}`;
}

export function hasAcknowledgedRules(code: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(rulesStorageKey(code)) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeRules(code: string): void {
  try {
    sessionStorage.setItem(rulesStorageKey(code), "1");
  } catch {
    /* ignore */
  }
}

export function RulesScreen({
  onDone,
  onBack,
  boardMode = "7x7",
}: {
  onDone: () => void;
  onBack?: () => void;
  boardMode?: BoardMode;
}) {
  return (
    <div className="animate-fadeIn flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-1">
      <h2 className="font-display text-3xl font-bold text-surface">How to play</h2>
      <p className="mt-1 text-sm text-surface/70">
        Chowka Bhara — {boardMode} board. An ancient cross-and-circle race game.
      </p>

      <div className="mt-5">
        <RulesPathBoard boardMode={boardMode} />
        <p className="mt-3 text-center text-sm leading-relaxed text-surface/75">
          Example path from the bottom home (red). Each color starts at their own
          edge-middle home and spirals the same way into the golden center.
        </p>
      </div>

      <ol className="mt-6 space-y-2.5">
        {GAME_LOOP.map((step, i) => (
          <li
            key={step.title}
            className="rounded-2xl bg-surface px-4 py-3 text-ink shadow-card"
          >
            <p className="font-display text-sm font-semibold text-o2-dark">
              {i + 1}. {step.title}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            {step.title === "Throw" && <ShellThrowGuide />}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-center text-xs text-surface/60">
        You can’t land on your own pawn except home or center.
      </p>

      <div className="mt-auto space-y-3 pt-8 pb-2">
        <PrimaryButton onClick={onDone}>Got it — let's play</PrimaryButton>
        {onBack && (
          <PrimaryButton variant="ghost" onClick={onBack}>
            Back
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}
