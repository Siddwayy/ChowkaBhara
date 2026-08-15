import { getBoardConfig, type BoardMode } from "@chowka/shared";

/** Distance from the board edge (0 = outer ring). */
export function ringDist(r: number, c: number, boardSize: number): number {
  return Math.min(r, c, boardSize - 1 - r, boardSize - 1 - c);
}

/** Wood-family fills for concentric path zones (high contrast for new players). */
export const ZONE_FILL = {
  /** Level 1 — outer perimeter: near-white. */
  outer: "linear-gradient(180deg, #faf8f2 0%, #f3eee3 100%)",
  /** Level 2 — middle ring (7×7) / unused on 5×5 as primary mid. */
  middle: "linear-gradient(180deg, #e8c98a 0%, #d4a85c 100%)",
  /** Level 3 — inner ring before HOME. */
  inner: "linear-gradient(180deg, #c4a08a 0%, #a67c68 100%)",
  safe: "linear-gradient(180deg, #a67c3d 0%, #8b6914 100%)",
  center: "linear-gradient(160deg, #FFE9A8 0%, #F5C842 45%, #D4A017 100%)",
} as const;

/**
 * Base cell fill before travel/preview overlays.
 * 7×7: outer / middle / inner. 5×5: outer / inner only (d===1 is inner).
 */
export function zoneBaseFill(
  r: number,
  c: number,
  safe: boolean,
  isCenter: boolean,
  boardMode: BoardMode = "7x7",
): string {
  if (isCenter) return ZONE_FILL.center;
  if (safe) return ZONE_FILL.safe;
  const boardSize = getBoardConfig(boardMode).boardSize;
  const d = ringDist(r, c, boardSize);
  if (d === 0) return ZONE_FILL.outer;
  if (boardMode === "5x5") return ZONE_FILL.inner;
  if (d === 1) return ZONE_FILL.middle;
  return ZONE_FILL.inner;
}
