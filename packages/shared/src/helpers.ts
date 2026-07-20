import {
  BONUS_ROLLS,
  CENTER_INDEX,
  INNER_RING_START,
  ROLL_VALUES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "./constants.js";
import type { Color } from "./types.js";

/** Opposite home seats for face-to-face 2-player games. */
const OPPOSITE: Record<Color, Color> = {
  red: "green",
  green: "red",
  blue: "yellow",
  yellow: "blue",
};

/** Path indices that are safe for every color (homes + center). */
const SAFE_PATH_INDICES = new Set([0, 4, 8, 12, CENTER_INDEX]);

export function oppositeColor(color: Color): Color {
  return OPPOSITE[color];
}

/**
 * Throw 4 cowrie shells. Each shell is mouth-up with p=0.5; the count of
 * mouth-up shells is the roll, except 0 up which scores 8.
 */
export function rollShells(random: () => number = Math.random): number {
  let up = 0;
  for (let i = 0; i < 4; i++) {
    if (random() < 0.5) up += 1;
  }
  return up === 0 ? 8 : up;
}

/** Rolling a 4 or an 8 earns the same player another turn. */
export function isBonusRoll(roll: number): boolean {
  return BONUS_ROLLS.includes(roll);
}

export function isValidRoll(roll: number): boolean {
  return (ROLL_VALUES as readonly number[]).includes(roll);
}

/**
 * Pocket (-1) is treated as sitting on home (index 0). Movement always leaves
 * the current cell, so a roll of N advances N steps along the path.
 */
export function effectivePos(pos: number): number {
  return pos < 0 ? 0 : pos;
}

/** Destination index for a pawn given the roll. */
export function destForPawn(pos: number, roll: number): number {
  return effectivePos(pos) + roll;
}

/**
 * True if another of this player's pawns already occupies `dest`.
 * Safe cells (path indices 0/4/8/12/24) may stack; every other cell is exclusive.
 */
export function wouldLandOnOwnPawn(
  pawns: number[],
  pawnIndex: number,
  dest: number,
): boolean {
  if (SAFE_PATH_INDICES.has(dest)) return false;
  for (let i = 0; i < pawns.length; i++) {
    if (i === pawnIndex) continue;
    if (effectivePos(pawns[i]!) === dest) return true;
  }
  return false;
}

/**
 * Is moving this pawn by `roll` legal?
 *  - finished pawn (on center) cannot move
 *  - center needs an exact landing; overshooting past 24 is illegal
 *  - cannot enter the inner ring (index >= 16) until a capture has been made
 *  - cannot land on a cell already occupied by your own pawn (except safe cells)
 */
export function isMoveValid(
  pos: number,
  roll: number,
  hasCaptured: boolean = false,
  pawns?: number[],
  pawnIndex?: number,
): boolean {
  if (!isValidRoll(roll)) return false;
  const from = effectivePos(pos);
  if (from === CENTER_INDEX) return false;
  const dest = from + roll;
  if (dest > CENTER_INDEX) return false;
  if (!hasCaptured && dest >= INNER_RING_START) return false;
  if (pawns && pawnIndex != null && wouldLandOnOwnPawn(pawns, pawnIndex, dest)) {
    return false;
  }
  return true;
}

/** Indices of pawns that can legally move with the current roll. */
export function computeValidMoves(
  pawns: number[],
  roll: number,
  hasCaptured: boolean,
  _color?: Color,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < pawns.length; i++) {
    if (isMoveValid(pawns[i]!, roll, hasCaptured, pawns, i)) out.push(i);
  }
  return out;
}

export function finishedCount(pawns: number[]): number {
  return pawns.filter((p) => p === CENTER_INDEX).length;
}

/** How far a player's furthest pawn has progressed (for ranking). */
export function maxProgress(pawns: number[]): number {
  return pawns.reduce((m, p) => Math.max(m, Math.min(p, CENTER_INDEX)), -1);
}

export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function generatePlayerId(random: () => number = Math.random): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
