import type { Color } from "./types.js";

export type Coord = readonly [number, number];

export type BoardMode = "7x7" | "5x5";

export const BOARD_MODES = ["7x7", "5x5"] as const;

export function isBoardMode(value: unknown): value is BoardMode {
  return value === "7x7" || value === "5x5";
}

export interface EntryJump {
  from: Coord;
  to: Coord;
}

export interface BoardConfig {
  mode: BoardMode;
  boardSize: number;
  pathLength: number;
  centerIndex: number;
  paths: Record<Color, Coord[]>;
  safeCells: readonly Coord[];
  safePathIndices: ReadonlySet<number>;
  /** Outer → next ring (middle on 7×7, inner on 5×5). */
  middleEntryJumps: Record<Color, EntryJump>;
  /** Middle → inner diagonal on 7×7; null on 5×5. */
  innerEntryJumps: Record<Color, EntryJump> | null;
}

/** Rotate a coordinate 90° clockwise about the board center. */
function rotateCW90(boardSize: number, [r, c]: Coord): Coord {
  return [c, boardSize - 1 - r];
}

function rotatePath(boardSize: number, path: Coord[], times: number): Coord[] {
  let out: Coord[] = path.map(([r, c]) => [r, c] as Coord);
  for (let t = 0; t < times; t++) {
    out = out.map((coord) => rotateCW90(boardSize, coord));
  }
  return out;
}

function pathsFromBase(boardSize: number, base: Coord[]): Record<Color, Coord[]> {
  return {
    red: rotatePath(boardSize, base, 0),
    blue: rotatePath(boardSize, base, 1),
    green: rotatePath(boardSize, base, 2),
    yellow: rotatePath(boardSize, base, 3),
  };
}

function jumpsFromBase(
  boardSize: number,
  from: Coord,
  to: Coord,
): Record<Color, EntryJump> {
  const out = {} as Record<Color, EntryJump>;
  const colors: Color[] = ["red", "blue", "green", "yellow"];
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i]!;
    out[color] = {
      from: rotatePath(boardSize, [from], i)[0]!,
      to: rotatePath(boardSize, [to], i)[0]!,
    };
  }
  return out;
}

/**
 * Canonical 49-step path for RED on 7×7 (entry = bottom-middle [6,3]).
 *   - indices 0..23  = outer ring (24 cells, anticlockwise — right first)
 *   - indices 24..39 = middle ring (16 cells, clockwise)
 *   - indices 40..47 = inner ring (8 cells, clockwise)
 *   - index 48       = center goal [3,3]
 */
const BASE_PATH_RED_7: Coord[] = [
  [6, 3], [6, 4], [6, 5], [6, 6],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 5], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0],
  [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
  [6, 1], [6, 2],
  [5, 2], [5, 3], [5, 4], [5, 5],
  [4, 5], [3, 5], [2, 5], [1, 5],
  [1, 4], [1, 3], [1, 2], [1, 1],
  [2, 1], [3, 1], [4, 1], [5, 1],
  [4, 2], [4, 3], [4, 4], [3, 4],
  [2, 4], [2, 3], [2, 2], [3, 2],
  [3, 3],
];

const SAFE_CELLS_7: readonly Coord[] = [
  [6, 3], [3, 0], [0, 3], [3, 6],
  [1, 1], [1, 5], [5, 1], [5, 5],
  [3, 3],
];

/** Traditional 5×5: outer ACW (16) → inner CW (8) → center. */
const BASE_PATH_RED_5: Coord[] = [
  // Outer (16) — anticlockwise, right first from bottom entry
  [4, 2], [4, 3], [4, 4],
  [3, 4], [2, 4], [1, 4], [0, 4],
  [0, 3], [0, 2], [0, 1], [0, 0],
  [1, 0], [2, 0], [3, 0], [4, 0],
  [4, 1],
  // Inner (8) — clockwise from [3,1]
  [3, 1], [3, 2], [3, 3], [2, 3],
  [1, 3], [1, 2], [1, 1], [2, 1],
  // Center
  [2, 2],
];

const SAFE_CELLS_5: readonly Coord[] = [
  [4, 2], // red home
  [2, 0], // blue home
  [0, 2], // green home
  [2, 4], // yellow home
  [2, 2], // center
];

function buildConfig(
  mode: BoardMode,
  boardSize: number,
  basePath: Coord[],
  safeCells: readonly Coord[],
  safePathIndices: ReadonlySet<number>,
  middleFrom: Coord,
  middleTo: Coord,
  innerJump: { from: Coord; to: Coord } | null,
): BoardConfig {
  const paths = pathsFromBase(boardSize, basePath);
  return {
    mode,
    boardSize,
    pathLength: basePath.length,
    centerIndex: basePath.length - 1,
    paths,
    safeCells,
    safePathIndices,
    middleEntryJumps: jumpsFromBase(boardSize, middleFrom, middleTo),
    innerEntryJumps: innerJump
      ? jumpsFromBase(boardSize, innerJump.from, innerJump.to)
      : null,
  };
}

export const BOARD_CONFIGS: Record<BoardMode, BoardConfig> = {
  "7x7": buildConfig(
    "7x7",
    7,
    BASE_PATH_RED_7,
    SAFE_CELLS_7,
    new Set([0, 6, 12, 18, 27, 31, 35, 39, 48]),
    [6, 2],
    [5, 2],
    { from: [5, 1], to: [4, 2] },
  ),
  "5x5": buildConfig(
    "5x5",
    5,
    BASE_PATH_RED_5,
    SAFE_CELLS_5,
    new Set([0, 4, 8, 12, 24]),
    [4, 1],
    [3, 1],
    null,
  ),
};

export function getBoardConfig(mode: BoardMode | null | undefined): BoardConfig {
  if (mode && mode in BOARD_CONFIGS) return BOARD_CONFIGS[mode];
  return BOARD_CONFIGS["7x7"];
}

export function coordForMode(
  mode: BoardMode | null | undefined,
  color: Color,
  pos: number,
): Coord | null {
  const cfg = getBoardConfig(mode);
  if (pos < 0 || pos >= cfg.paths[color].length) return null;
  return cfg.paths[color][pos] ?? null;
}

export function homeCoordMode(
  mode: BoardMode | null | undefined,
  color: Color,
): Coord {
  return getBoardConfig(mode).paths[color][0]!;
}

export function isSafeCellMode(
  mode: BoardMode | null | undefined,
  coord: Coord,
): boolean {
  return getBoardConfig(mode).safeCells.some(
    (s) => s[0] === coord[0] && s[1] === coord[1],
  );
}

export function pathStepCoordsMode(
  mode: BoardMode | null | undefined,
  color: Color,
  from: number,
  to: number,
): Coord[] {
  const start = from < 0 ? -1 : from;
  const end = Math.max(start, to);
  const out: Coord[] = [];
  for (let i = start + 1; i <= end; i++) {
    const c = coordForMode(mode, color, i);
    if (c) out.push(c);
  }
  return out;
}
