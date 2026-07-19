import type { Color } from "@chowka/shared";

export interface ColorTheme {
  label: string;
  /** Solid token fill. */
  hex: string;
  /** Darker edge for token depth. */
  edge: string;
  /** Soft translucent tint for home bases / chips. */
  soft: string;
}

export const COLOR_THEME: Record<Color, ColorTheme> = {
  red: { label: "Red", hex: "#FF6B4A", edge: "#C43E22", soft: "rgba(255,107,74,0.22)" },
  blue: { label: "Blue", hex: "#3B82F6", edge: "#1D4ED8", soft: "rgba(59,130,246,0.22)" },
  green: { label: "Green", hex: "#2EC4B6", edge: "#1A8377", soft: "rgba(46,196,182,0.22)" },
  yellow: { label: "Yellow", hex: "#FFB020", edge: "#C77F00", soft: "rgba(255,176,32,0.24)" },
};

export function colorTheme(color: Color | null | undefined): ColorTheme | null {
  return color ? COLOR_THEME[color] : null;
}
