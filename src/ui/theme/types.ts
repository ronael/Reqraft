export type ThemeColor = "white" | "gray" | "cyan" | "blue" | "green" | "yellow" | "red";

export type PanelTone = "primary" | "secondary" | "inline";

export interface TerminalTheme {
  color: {
    text: ThemeColor;
    muted: ThemeColor;
    border: ThemeColor;
    accent: ThemeColor;
    accentSoft: ThemeColor;
    success: ThemeColor;
    warning: ThemeColor;
    danger: ThemeColor;
    info: ThemeColor;
  };
  spacing: {
    compact: number;
    normal: number;
    roomy: number;
  };
  behavior: {
    toastDurationMs: number;
    spinnerFrameIntervalMs: number;
    maxErrorMessageCharacters: number;
  };
}
