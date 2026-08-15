/** Game-wide rules constants. Board geometry lives in boardConfig.ts. */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const PAWNS_PER_PLAYER = 4;

/** Player colors. Homes: red=bottom, blue=left, green=top, yellow=right. */
export const COLORS = ["red", "blue", "green", "yellow"] as const;

/** Pawn token shapes — picked in lobby alongside color. */
export const PAWN_SHAPES = ["circle", "square", "star", "triangle"] as const;

/** Possible cowrie outcomes (4 shells; mouth-up count, 0 up = 8). */
export const ROLL_VALUES = [1, 2, 3, 4, 8] as const;
/** Rolling one of these grants the same player another turn. */
export const BONUS_ROLLS: readonly number[] = [4, 8];

/** Per-cell travel animation step (client + used to size resolution). */
export const TRAVEL_STEP_MS = 140;
/** Brief pause after the pawn lands before the next turn. */
export const TRAVEL_SETTLE_MS = 200;
/** Extra slack on the Durable Object resolution alarm (client drives the clock). */
export const RESOLUTION_ALARM_SLACK_MS = 400;

/**
 * Time from the first (instant) step until land + settle.
 * Used by the active client to send `advanceResolution`.
 */
export function travelDurationMs(steps: number): number {
  const n = Math.max(1, steps);
  return (n - 1) * TRAVEL_STEP_MS + TRAVEL_SETTLE_MS;
}

/** Server resolution window (travel + slack so the DO alarm is only a fallback). */
export function resolutionMsForSteps(steps: number): number {
  return travelDurationMs(steps) + RESOLUTION_ALARM_SLACK_MS;
}

/** Auto-throw shells if the active player idles. */
export const ROLL_TIMEOUT_MS = 20_000;
/** Auto-move a random legal pawn if the active player idles. */
export const MOVE_TIMEOUT_MS = 45_000;
/** Auto-pass when there are no legal moves and Skip isn't pressed. */
export const SKIP_TIMEOUT_MS = 10_000;
export const RECONNECT_GRACE_MS = 30_000;

export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
