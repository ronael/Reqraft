import { palette } from "./palette.js";
import type { TerminalTheme } from "./types.js";

export const theme: TerminalTheme = {
  color: palette,
  spacing: { compact: 0, normal: 1, roomy: 2 },
};
