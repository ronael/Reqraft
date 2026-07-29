import { palette } from "./palette.js";
import type { TerminalTheme } from "./types.js";

export const theme: TerminalTheme = {
  color: palette,
  spacing: { compact: 0, normal: 1, roomy: 2 },
  behavior: {
    toastDurationMs: 1_500,
    spinnerFrameIntervalMs: 120,
    maxErrorMessageCharacters: 240,
  },
};
