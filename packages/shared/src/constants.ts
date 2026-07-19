/** Chowka Bhara board & rules constants — single source of truth. */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const PAWNS_PER_PLAYER = 4;

export const BOARD_SIZE = 5;
/** Track positions 0..24. 24 = center (home). -1 = pocket (off board). */
export const PATH_LENGTH = 25;
export const CENTER_INDEX = 24;
/** Indices >= this are the inner ring + center — gated behind a capture. */
export const INNER_RING_START = 16;
export const OUTER_RING_LENGTH = 16;
export const POCKET = -1;

/** Player colors. Homes: red=bottom, blue=left, green=top, yellow=right.
 * Paths travel anticlockwise (red's first step is to the right). */
export const COLORS = ["red", "blue", "green", "yellow"] as const;

/** The 5 safe squares (marked with an X on the classic board): the 4
 * edge-middle home bases and the center. Pawns here cannot be captured and
 * may stack freely. */
export const SAFE_CELLS: readonly (readonly [number, number])[] = [
  [4, 2], // red home (bottom)
  [2, 0], // blue home (left)
  [0, 2], // green home (top)
  [2, 4], // yellow home (right)
  [2, 2], // center
];

/** Possible cowrie outcomes (4 shells; mouth-up count, 0 up = 8). */
export const ROLL_VALUES = [1, 2, 3, 4, 8] as const;
/** Rolling one of these grants the same player another turn. */
export const BONUS_ROLLS: readonly number[] = [4, 8];

/** How long the "resolution" pause lasts so moves/captures animate. */
export const RESOLUTION_MS = 1600;
/** Auto-act after this long so an idle player never stalls the table. */
export const TURN_TIMEOUT_MS = 45_000;
export const RECONNECT_GRACE_MS = 30_000;

export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
