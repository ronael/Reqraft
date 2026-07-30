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
