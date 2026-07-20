import { BOARD_SIZE } from "@chowka/shared";

/** Distance from the board edge (0 = outer ring … 3 = center on 7×7). */
export function ringDist(r: number, c: number): number {
  return Math.min(r, c, BOARD_SIZE - 1 - r, BOARD_SIZE - 1 - c);
}

/** Wood-family fills for concentric path zones. */
export const ZONE_FILL = {
  outer: "linear-gradient(180deg, #f5ead4 0%, #ebe0c8 100%)",
  middle: "linear-gradient(180deg, #e4d0a8 0%, #d4bc8e 100%)",
  inner: "linear-gradient(180deg, #d2b888 0%, #c4a574 100%)",
  safe: "linear-gradient(180deg, #a67c3d 0%, #8b6914 100%)",
  center: "linear-gradient(160deg, #FFE9A8 0%, #F5C842 45%, #D4A017 100%)",
} as const;

/**
 * Base cell fill before travel/preview overlays.
 * Center stays gold; safe/start homes use the darker override.
 */
export function zoneBaseFill(r: number, c: number, safe: boolean, isCenter: boolean): string {
  if (isCenter) return ZONE_FILL.center;
  if (safe) return ZONE_FILL.safe;
  const d = ringDist(r, c);
  if (d === 0) return ZONE_FILL.outer;
  if (d === 1) return ZONE_FILL.middle;
  return ZONE_FILL.inner;
}
