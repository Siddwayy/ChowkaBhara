import { BOARD_SIZE, SAFE_CELLS } from "./constants.js";
import type { Color } from "./types.js";

export type Coord = readonly [number, number];

/**
 * Canonical 49-step path for RED (entry = bottom-middle [6,3]).
 *   - indices 0..23  = outer ring (24 cells, anticlockwise — right first)
 *   - indices 24..39 = middle ring (16 cells, clockwise)
 *   - indices 40..47 = inner ring (8 cells, clockwise)
 *   - index 48       = center goal [3,3]
 *
 * Note: step 39→40 is a deliberate diagonal jump [5,1] → [4,2] so the pawn
 * enters the inner ring without revisiting [5,2].
 */
export const BASE_PATH_RED: Coord[] = [
  // Outer ring (24) — anticlockwise, right first from bottom entry
  [6, 3], [6, 4], [6, 5], [6, 6],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 5], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0],
  [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
  [6, 1], [6, 2],
  // Middle ring (16) — clockwise; ends at [5,1] then jumps diagonally in
  [5, 2], [5, 3], [5, 4], [5, 5],
  [4, 5], [3, 5], [2, 5], [1, 5],
  [1, 4], [1, 3], [1, 2], [1, 1],
  [2, 1], [3, 1], [4, 1], [5, 1],
  // Inner ring (8) — clockwise from [4,2]
  [4, 2], [4, 3], [4, 4], [3, 4],
  [2, 4], [2, 3], [2, 2], [3, 2],
  // Center goal
  [3, 3],
];

/** Rotate a coordinate 90° clockwise about the board center. */
function rotateCW90([r, c]: Coord): Coord {
  return [c, BOARD_SIZE - 1 - r];
}

function rotatePath(path: Coord[], times: number): Coord[] {
  let out: Coord[] = path.map(([r, c]) => [r, c] as Coord);
  for (let t = 0; t < times; t++) out = out.map(rotateCW90);
  return out;
}

/**
 * Per-color path arrays. Each color is RED's path rotated 90° so all four
 * travel the SAME shared track (captures by absolute cell):
 *   red = bottom (first step right),
 *   blue = left (first step down),
 *   green = top (first step left),
 *   yellow = right (first step up).
 */
export const PATHS: Record<Color, Coord[]> = {
  red: rotatePath(BASE_PATH_RED, 0),
  blue: rotatePath(BASE_PATH_RED, 1),
  green: rotatePath(BASE_PATH_RED, 2),
  yellow: rotatePath(BASE_PATH_RED, 3),
};

/**
 * Off-board START yard for each color, just outside the entry safe cell.
 * Not part of PATHS — pawns sit here at position -1.
 */
export const START_COORDS: Record<Color, Coord> = {
  red: [7, 3],
  blue: [3, -1],
  green: [-1, 3],
  yellow: [3, 7],
};

/** Board coordinate for a pawn, or null if it is still in the pocket (-1). */
export function coordFor(color: Color, pos: number): Coord | null {
  if (pos < 0 || pos >= PATHS[color].length) return null;
  return PATHS[color][pos] ?? null;
}

/** Off-board START cell for a color (pocket / not yet entered). */
export function startCoord(color: Color): Coord {
  return START_COORDS[color];
}

export function isSameCell(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function isSafeCell(coord: Coord): boolean {
  return SAFE_CELLS.some((s) => s[0] === coord[0] && s[1] === coord[1]);
}

/** True if (r,c) lies in the inner 5×5 zone. */
export function isInnerZone(coord: Coord): boolean {
  const [r, c] = coord;
  return r >= 1 && r <= 5 && c >= 1 && c <= 5;
}

/** The entry safe-square coordinate (path index 0) for a color. */
export function homeCoord(color: Color): Coord {
  return PATHS[color][0]!;
}

/**
 * Coords visited when moving from→to along the player's path (includes
 * destination; excludes the start cell the pawn leaves). From pocket (-1),
 * includes every board cell from entry (0) through `to`.
 */
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
