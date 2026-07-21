import {
  BONUS_ROLLS,
  ROLL_VALUES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "./constants.js";
import { getBoardConfig, type BoardMode } from "./boardConfig.js";
import type { Color } from "./types.js";

/** Opposite home seats for face-to-face 2-player games. */
const OPPOSITE: Record<Color, Color> = {
  red: "green",
  green: "red",
  blue: "yellow",
  yellow: "blue",
};

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
 * Safe cells may stack; every other cell is exclusive.
 */
export function wouldLandOnOwnPawn(
  pawns: number[],
  pawnIndex: number,
  dest: number,
  mode?: BoardMode | null,
): boolean {
  const cfg = getBoardConfig(mode);
  if (cfg.safePathIndices.has(dest)) return false;
  for (let i = 0; i < pawns.length; i++) {
    if (i === pawnIndex) continue;
    if (effectivePos(pawns[i]!) === dest) return true;
  }
  return false;
}

/**
 * Is moving this pawn by `roll` legal?
 *  - finished pawn (on center) cannot move
 *  - center needs an exact landing; overshooting past center is illegal
 *  - cannot land on a cell already occupied by your own pawn (except safe cells)
 */
export function isMoveValid(
  pos: number,
  roll: number,
  _hasCaptured: boolean = false,
  pawns?: number[],
  pawnIndex?: number,
  mode?: BoardMode | null,
): boolean {
  const center = getBoardConfig(mode).centerIndex;
  if (!isValidRoll(roll)) return false;
  if (pos === center) return false;
  const dest = destForPawn(pos, roll);
  if (dest > center) return false;
  if (
    pawns &&
    pawnIndex != null &&
    wouldLandOnOwnPawn(pawns, pawnIndex, dest, mode)
  ) {
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
  mode?: BoardMode | null,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < pawns.length; i++) {
    if (isMoveValid(pawns[i]!, roll, hasCaptured, pawns, i, mode)) out.push(i);
  }
  return out;
}

export function finishedCount(pawns: number[], mode?: BoardMode | null): number {
  const center = getBoardConfig(mode).centerIndex;
  return pawns.filter((p) => p === center).length;
}

/** How far a player's furthest pawn has progressed (for ranking). */
export function maxProgress(pawns: number[], mode?: BoardMode | null): number {
  const center = getBoardConfig(mode).centerIndex;
  return pawns.reduce((m, p) => Math.max(m, Math.min(p, center)), -1);
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
