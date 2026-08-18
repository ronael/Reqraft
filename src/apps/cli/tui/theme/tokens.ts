import { PALETTE_VALUES } from "@/shared/palette-values.js";
import type { TerminalCapabilities } from "@/shared/terminal/capabilities.js";

/**
 * Design tokens for the TUI.
 *
 * This is the file to edit when changing how Reqraft looks. Components never
 * name a colour, a padding or a border style directly — they read a token —
 * so a change here reaches every surface at once.
 *
 * Raw hex lives in `shared/palette-values.ts`, shared with the desktop
 * renderer: the two surfaces must not drift apart on brand colour.
 */

/** Semantic colour roles. Components ask for a role, never for a hex value. */
export interface ColorTokens {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderFocused: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
}

export interface SpacingTokens {
  none: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
}

/** OpenTUI border styles, kept as a token so ASCII fallback is one decision. */
export interface BorderTokens {
  default: "single" | "rounded" | "double" | "heavy";
  focused: "single" | "rounded" | "double" | "heavy";
}

export interface LayoutTokens {
  /** Below this width the layout stacks instead of splitting columns. */
  splitMinimumWidth: number;
  /** Below this height secondary rows are dropped rather than squeezed. */
  compactMaximumHeight: number;
  minimumWidth: number;
  minimumHeight: number;
  sidebarWidth: number;
}

export interface Tokens {
  color: ColorTokens;
  spacing: SpacingTokens;
  border: BorderTokens;
  layout: LayoutTokens;
}

const COLOR: ColorTokens = {
  background: "#09090b",
  surface: "#111113",
  surfaceRaised: "#17171a",
  border: "#3f3f46",
  borderFocused: PALETTE_VALUES.accent,
  text: "#e4e4e7",
  textMuted: "#71717a",
  textSubtle: "#a1a1aa",
  accent: PALETTE_VALUES.accent,
  success: PALETTE_VALUES.success,
  warning: PALETTE_VALUES.warning,
  error: PALETTE_VALUES.danger,
};

/**
 * Colourless terminals get structure, not colour. Every role collapses to the
 * same pair so borders and text stay legible without hue carrying meaning —
 * status is also signalled by a glyph, never by colour alone.
 */
const MONOCHROME: ColorTokens = {
  background: "black",
  surface: "black",
  surfaceRaised: "black",
  border: "white",
  borderFocused: "white",
  text: "white",
  textMuted: "white",
  textSubtle: "white",
  accent: "white",
  success: "white",
  warning: "white",
  error: "white",
};

/** Terminal rows and columns are integers: spacing is a cell count, not a scale. */
export const SPACING: SpacingTokens = { none: 0, xs: 1, sm: 2, md: 3, lg: 4 };

export const LAYOUT: LayoutTokens = {
  splitMinimumWidth: 100,
  compactMaximumHeight: 26,
  minimumWidth: 60,
  minimumHeight: 16,
  sidebarWidth: 28,
};

export function createTokens(capabilities: TerminalCapabilities): Tokens {
  return {
    color: capabilities.color ? COLOR : MONOCHROME,
    spacing: SPACING,
    border: capabilities.unicode
      ? { default: "single", focused: "rounded" }
      : { default: "single", focused: "single" },
    layout: LAYOUT,
  };
}
