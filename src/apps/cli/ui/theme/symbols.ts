import type { ThemeSymbols } from "./types.js";

const UNICODE_SYMBOLS: ThemeSymbols = {
  success: "✓",
  warning: "!",
  danger: "×",
  info: "i",
  active: "●",
  inactive: "○",
  caret: "›",
  diamond: "◇",
  arrow: "↳",
};

/** Same meanings, drawn with characters every terminal can render. */
const ASCII_SYMBOLS: ThemeSymbols = {
  success: "+",
  warning: "!",
  danger: "x",
  info: "i",
  active: "*",
  inactive: "o",
  caret: ">",
  diamond: "#",
  arrow: "->",
};

export function getSymbols(unicode: boolean): ThemeSymbols {
  return unicode ? UNICODE_SYMBOLS : ASCII_SYMBOLS;
}

/**
 * Spinner frames.
 *
 * Braille cells turn smoothly and occupy a single column. The ASCII fallback
 * keeps the same width so the line never shifts as it spins.
 */
const UNICODE_SPINNER = [
  "\u280b",
  "\u2819",
  "\u2839",
  "\u2838",
  "\u283c",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280f",
];
const ASCII_SPINNER = ["-", "\\", "|", "/"];

export function getSpinnerFrames(unicode: boolean): string[] {
  return unicode ? UNICODE_SPINNER : ASCII_SPINNER;
}
