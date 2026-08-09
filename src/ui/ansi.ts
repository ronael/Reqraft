export interface AnsiStyleOptions {
  color?: boolean;
  unicode?: boolean;
}

const RESET = "\u001b[0m";

export const ANSI = {
  accent: "38;2;167;139;250",
  success: "38;2;52;211;153",
  warning: "38;2;251;191;36",
  danger: "38;2;251;113;133",
  dim: "2",
  boldAccent: "1;38;2;167;139;250",
  boldWarning: "1;38;2;251;191;36",
} as const;

export function ansi(value: string, code: string, enabled = false): string {
  return enabled ? `\u001b[${code}m${value}${RESET}` : value;
}
