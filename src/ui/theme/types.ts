/**
 * A colour Ink can render: a name, a hex value, or `undefined` to inherit the
 * terminal foreground. Inheriting matters — forcing a foreground would break
 * readability on light terminal themes.
 */
export type ThemeColor = string | undefined;

/**
 * Panel emphasis.
 *
 * `primary` marks the focused panel, `success` and `danger` mark a finished
 * generation or a failure, `secondary` is the resting state, and `inline`
 * drops the border entirely for dense areas.
 */
export type PanelTone = "primary" | "secondary" | "success" | "danger" | "inline";

export type StatusTone = "success" | "warning" | "danger" | "info";

export interface ThemeColors {
  text: ThemeColor;
  textMuted: ThemeColor;
  textSubtle: ThemeColor;
  accent: ThemeColor;
  accentStrong: ThemeColor;
  border: ThemeColor;
  borderFocused: ThemeColor;
  success: ThemeColor;
  warning: ThemeColor;
  danger: ThemeColor;
  info: ThemeColor;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
}

/**
 * Glyphs that carry meaning. Every status has one so colour is never the only
 * signal, and every glyph has an ASCII fallback for terminals with unreliable
 * Unicode.
 */
export interface ThemeSymbols {
  success: string;
  warning: string;
  danger: string;
  info: string;
  active: string;
  inactive: string;
  /** Leads the input panel title. */
  caret: string;
  /** Leads the result panel title. */
  diamond: string;
  /** Points at the suggested next action in empty states. */
  arrow: string;
}

/** Ink border styles, split so the ASCII fallback stays a single decision. */
export interface ThemeBorders {
  primary: "round" | "classic";
  secondary: "single" | "classic";
}

export interface TerminalTheme {
  color: ThemeColors;
  spacing: ThemeSpacing;
  symbol: ThemeSymbols;
  border: ThemeBorders;
  behavior: {
    toastDurationMs: number;
    spinnerFrameIntervalMs: number;
    maxErrorMessageCharacters: number;
  };
}
