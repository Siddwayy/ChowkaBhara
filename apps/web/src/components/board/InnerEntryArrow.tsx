import { memo } from "react";
import {
  getBoardConfig,
  type BoardMode,
  type Color,
  type Coord,
} from "@chowka/shared";
import { COLOR_THEME } from "../../lib/colors";

/**
 * Thin arrow (shaft + head) in board-cell viewBox units.
 * Kept small and low-contrast for ring-entry cues.
 */
export function boldArrowPath(from: Coord, to: Coord, inset = 0.32): string {
  const x0 = from[1] + 0.5;
  const y0 = from[0] + 0.5;
  const x1 = to[1] + 0.5;
  const y1 = to[0] + 0.5;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const sx = x0 + ux * inset;
  const sy = y0 + uy * inset;
  const tipX = x1 - ux * inset;
  const tipY = y1 - uy * inset;

  const halfW = 0.045;
  const headLen = 0.18;
  const headHalf = 0.11;
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
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`).join(" ") +
    " Z"
  );
}

const ARROW_OUTLINE = "#000000";
const ARROW_STROKE = 0.04;

function ArrowPath({
  d,
  fill,
  opacity = 1,
}: {
  d: string;
  fill: string;
  opacity?: number;
}) {
  return (
    <path
      d={d}
      fill={fill}
      stroke={ARROW_OUTLINE}
      strokeWidth={ARROW_STROKE}
      strokeLinejoin="round"
      strokeLinecap="round"
      paintOrder="stroke fill"
      opacity={opacity}
    />
  );
}

export function InnerEntryArrow({
  from,
  to,
  boardSize,
  inset = 0.32,
}: {
  from: Coord;
  to: Coord;
  boardSize: number;
  inset?: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${boardSize} ${boardSize}`}
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      aria-hidden="true"
    >
      <ArrowPath d={boldArrowPath(from, to, inset)} fill="#3d2a12" opacity={0.28} />
    </svg>
  );
}

/**
 * Entry arrows per color in play from the active board config.
 */
export const InnerEntryArrows = memo(function InnerEntryArrows({
  colors,
  boardMode = "7x7",
}: {
  colors: readonly Color[];
  boardMode?: BoardMode;
}) {
  const cfg = getBoardConfig(boardMode);
  return (
    <svg
      viewBox={`0 0 ${cfg.boardSize} ${cfg.boardSize}`}
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      aria-hidden="true"
    >
      {colors.map((color) => {
        const fill = COLOR_THEME[color].edge;
        const middle = cfg.middleEntryJumps[color];
        const inner = cfg.innerEntryJumps?.[color];
        return (
          <g key={`entry-${color}`}>
            <ArrowPath
              d={boldArrowPath(middle.from, middle.to, 0.18)}
              fill={fill}
              opacity={0.4}
            />
            {inner && (
              <ArrowPath
                d={boldArrowPath(inner.from, inner.to)}
                fill={fill}
                opacity={0.4}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
});
