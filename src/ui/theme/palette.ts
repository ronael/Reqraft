import type { ThemeColors } from "./types.js";
import { PALETTE_VALUES } from "./palette-values.js";

/**
 * Reqraft palette, taken from `docs/design/reqraft-cli-ui.html`.
 *
 * Violet carries identity, focus and actions. Status colours are reserved for
 * success, warning and failure. Everything else stays neutral so the interface
 * reads as calm rather than decorated. The raw hex values live in
 * `palette-values.ts`, shared with the desktop renderer.
 *
 * `text` is deliberately left undefined: the terminal foreground is inherited
 * so the interface stays readable on both light and dark themes. Chalk narrows
 * these hex values down to the nearest supported colour on limited terminals.
 */
const COLORS: ThemeColors = {
  text: undefined,
  textMuted: "gray",
  textSubtle: "gray",
  accent: PALETTE_VALUES.accent,
  accentStrong: PALETTE_VALUES.accentStrong,
  border: "gray",
  borderFocused: PALETTE_VALUES.accent,
  success: PALETTE_VALUES.success,
  warning: PALETTE_VALUES.warning,
  danger: PALETTE_VALUES.danger,
  info: PALETTE_VALUES.accent,
};

/** Every role collapses to the terminal default when colour is unavailable. */
const MONOCHROME: ThemeColors = {
  text: undefined,
  textMuted: undefined,
  textSubtle: undefined,
  accent: undefined,
  accentStrong: undefined,
  border: undefined,
  borderFocused: undefined,
  success: undefined,
  warning: undefined,
  danger: undefined,
  info: undefined,
};

export function getPalette(color: boolean): ThemeColors {
  return color ? COLORS : MONOCHROME;
}
