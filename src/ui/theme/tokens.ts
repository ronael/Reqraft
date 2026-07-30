import process from "node:process";
import { detectCapabilities, type TerminalCapabilities } from "./capabilities.js";
import { getPalette } from "./palette.js";
import { getSymbols } from "./symbols.js";
import type { TerminalTheme } from "./types.js";

const BEHAVIOR = {
  toastDurationMs: 1_500,
  spinnerFrameIntervalMs: 120,
  maxErrorMessageCharacters: 240,
} as const;

const SPACING = { xs: 0, sm: 1, md: 2, lg: 3 } as const;

export function createTheme(capabilities: TerminalCapabilities): TerminalTheme {
  return {
    color: getPalette(capabilities.color),
    spacing: SPACING,
    symbol: getSymbols(capabilities.unicode),
    border: capabilities.unicode
      ? { primary: "round", secondary: "single" }
      : { primary: "classic", secondary: "classic" },
    behavior: BEHAVIOR,
  };
}

/**
 * Theme for the running terminal.
 *
 * Resolved once at import: capabilities cannot change during a session, and a
 * stable object keeps Ink from re-rendering components that read it.
 */
export const theme: TerminalTheme = createTheme(
  detectCapabilities(process.env, process.stdout.isTTY, process.platform),
);
