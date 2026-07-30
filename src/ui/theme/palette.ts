import type { ThemeColors } from "./types.js";

/**
 * Reqraft palette, taken from `reqraft-cli-ui.html`.
 *
 * Violet carries identity, focus and actions. Status colours are reserved for
 * success, warning and failure. Everything else stays neutral so the interface
 * reads as calm rather than decorated.
 *
 * `text` is deliberately left undefined: the terminal foreground is inherited
 * so the interface stays readable on both light and dark themes. Chalk narrows
 * these hex values down to the nearest supported colour on limited terminals.
 */
const COLORS: ThemeColors = {
  text: undefined,
  textMuted: "gray",
  textSubtle: "gray",
  accent: "#a78bfa",
  accentStrong: "#8b5cf6",
  border: "gray",
  borderFocused: "#a78bfa",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#fb7185",
  info: "#a78bfa",
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
