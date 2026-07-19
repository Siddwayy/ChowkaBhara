import { BOARD_SIZE, SAFE_CELLS } from "./constants.js";
import type { Color } from "./types.js";

export type Coord = readonly [number, number];

/**
 * Canonical 25-step path for RED (home = bottom-middle).
 * A reversing SPIRAL: the outer ring is ANTICLOCKWISE (from bottom home the
 * first step goes RIGHT toward the bottom-right corner, up the right edge →
 * across the top → down the left → along the bottom), then the pawn steps
 * inside just before home and the inner ring runs CLOCKWISE into the center.
 *   - indices 0..15  = outer ring (16 cells, anticlockwise)
 *   - indices 16..23 = inner ring (8 cells, clockwise)
 *   - index 24       = center (goal)
 * Safe cells land on indices 0, 4, 8, 12 and 24. Every step is adjacent.
 */
export const BASE_PATH_RED: Coord[] = [
  // Outer ring (anticlockwise: right first)
  [4, 2], [4, 3], [4, 4], [3, 4], [2, 4],
  [1, 4], [0, 4], [0, 3], [0, 2], [0, 1],
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [4, 1],
  // Inner ring → center (enter from left of home, spiral CW: reverses direction)
  [3, 1], [2, 1], [1, 1], [1, 2],
  [1, 3], [2, 3], [3, 3], [3, 2],
  [2, 2],
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
 * Per-color path arrays. Each color is RED's anticlockwise path rotated 90°
 * so all four travel the SAME shared track (captures by absolute cell):
 *   red = bottom (first step right),
 *   yellow = right (first step up),
 *   green = top (first step left),
 *   blue = left (first step down).
 * 2-player games seat opposite: red↔green or blue↔yellow.
 */
export const PATHS: Record<Color, Coord[]> = {
  red: rotatePath(BASE_PATH_RED, 0),
  // 1 CW rotation of bottom-home path → left home, first step down
  blue: rotatePath(BASE_PATH_RED, 1),
  green: rotatePath(BASE_PATH_RED, 2),
  yellow: rotatePath(BASE_PATH_RED, 3),
};

/** Board coordinate for a pawn, or null if it is still in the pocket (-1). */
export function coordFor(color: Color, pos: number): Coord | null {
  if (pos < 0 || pos >= PATHS[color].length) return null;
  return PATHS[color][pos] ?? null;
}

export function isSameCell(a: Coord, b: Coord): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function isSafeCell(coord: Coord): boolean {
  return SAFE_CELLS.some((s) => s[0] === coord[0] && s[1] === coord[1]);
}

/** The home base coordinate (path index 0) for a color. */
export function homeCoord(color: Color): Coord {
  return PATHS[color][0]!;
}
