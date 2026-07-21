import { getBoardConfig, type Coord } from "./boardConfig.js";
import type { Color } from "./types.js";

export type { Coord } from "./boardConfig.js";

/** @deprecated Prefer getBoardConfig(mode).paths — defaults to 7×7. */
export const BASE_PATH_RED = getBoardConfig("7x7").paths.red;

/** @deprecated Prefer getBoardConfig(mode).paths — defaults to 7×7. */
export const PATHS = getBoardConfig("7x7").paths;

/** @deprecated Prefer getBoardConfig(mode).middleEntryJumps */
export const MIDDLE_ENTRY_JUMPS = getBoardConfig("7x7").middleEntryJumps;

/** @deprecated Prefer getBoardConfig(mode).innerEntryJumps */
export const INNER_ENTRY_JUMPS = getBoardConfig("7x7").innerEntryJumps!;

/**
 * Off-board START yard for each color (7×7). Not used by active play.
 */
export const START_COORDS: Record<Color, Coord> = {
  red: [7, 3],
  blue: [3, -1],
  green: [-1, 3],
  yellow: [3, 7],
};

/** Board coordinate for a pawn, or null if still in the pocket (-1). Defaults to 7×7. */
export function coordFor(color: Color, pos: number): Coord | null {
  const path = PATHS[color];
  if (pos < 0 || pos >= path.length) return null;
  return path[pos] ?? null;
}

export function startCoord(color: Color): Coord {
  return START_COORDS[color];
}

export function isSameCell(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Defaults to 7×7 safes. Prefer isSafeCellMode(mode, coord). */
export function isSafeCell(coord: Coord): boolean {
  return getBoardConfig("7x7").safeCells.some(
    (s) => s[0] === coord[0] && s[1] === coord[1],
  );
}

/** True if (r,c) lies in the inner 5×5 zone of a 7×7 board. */
export function isInnerZone(coord: Coord): boolean {
  const [r, c] = coord;
  return r >= 1 && r <= 5 && c >= 1 && c <= 5;
}

export function homeCoord(color: Color): Coord {
  return PATHS[color][0]!;
}

export function pathStepCoords(color: Color, from: number, to: number): Coord[] {
  const start = from < 0 ? -1 : from;
  const end = Math.max(start, to);
  const out: Coord[] = [];
  for (let i = start + 1; i <= end; i++) {
    const c = coordFor(color, i);
    if (c) out.push(c);
  }
  return out;
}
