import { ansi, ANSI, type AnsiStyleOptions } from "./ansi.js";
import { getSymbols } from "./theme/symbols.js";

export type InitStatusTone = "success" | "warning" | "error" | "info";

export function formatInitHeading(
  title: string,
  subtitle: string,
  options: AnsiStyleOptions = {},
): string {
  const divider = (options.unicode === false ? "-" : "─").repeat(40);
  return [
    ansi(title, ANSI.boldAccent, options.color),
    ansi(subtitle, ANSI.dim, options.color),
    ansi(divider, ANSI.dim, options.color),
  ].join("\n");
}

export function formatInitSection(title: string, options: AnsiStyleOptions = {}): string {
  return ansi(title, ANSI.boldAccent, options.color);
}

export function formatInitQuestion(question: string, options: AnsiStyleOptions = {}): string {
  return ansi(question, ANSI.bold, options.color);
}

export function formatInitChoice(
  index: number,
  label: string,
  active: boolean,
  options: AnsiStyleOptions = {},
): string {
  const symbols = getSymbols(options.unicode !== false);
  if (active) {
    return ansi(`${symbols.caret} ${String(index + 1)}. ${label}`, ANSI.accent, options.color);
  }
  const numberedChoice = `${String(index + 1)}.`;
  return `  ${ansi(numberedChoice, ANSI.dim, options.color)} ${label}`;
}

export function formatInitPrompt(
  label: string,
  defaultValue: string,
  options: AnsiStyleOptions = {},
): string {
  const defaultLabel = `(${defaultValue})`;
  const hint = defaultValue ? ` ${ansi(defaultLabel, ANSI.dim, options.color)}` : "";
  return `${label}${hint} : `;
}

export function formatInitStatus(
  message: string,
  tone: InitStatusTone,
  options: AnsiStyleOptions = {},
): string {
  const symbols = getSymbols(options.unicode !== false);
  const symbolByTone: Record<InitStatusTone, string> = {
    success: symbols.success,
    warning: symbols.warning,
    error: symbols.danger,
    info: symbols.info,
  };
  const colorByTone: Record<InitStatusTone, string> = {
    success: ANSI.success,
    warning: ANSI.warning,
    error: ANSI.danger,
    info: ANSI.accent,
  };
  const symbol = symbolByTone[tone];
  const color = colorByTone[tone];
  return ansi(`${symbol} ${message}`, color, options.color);
}

export function formatInitMetric(
  label: string,
  value: string,
  tone: "text" | InitStatusTone = "text",
  options: AnsiStyleOptions = {},
): string {
  const colorByTone: Record<InitStatusTone, string> = {
    success: ANSI.success,
    warning: ANSI.warning,
    error: ANSI.danger,
    info: ANSI.accent,
  };
  const color = tone === "text" ? undefined : colorByTone[tone];
  const styledValue = color ? ansi(value, color, options.color) : value;
  const spacing = " ".repeat(Math.max(1, 15 - label.length));
  return `${ansi(label, ANSI.dim, options.color)}${spacing}${styledValue}`;
}

export function formatInitCommand(command: string, options: AnsiStyleOptions = {}): string {
  return `${ansi("$", ANSI.dim, options.color)} ${ansi(command, ANSI.accent, options.color)}`;
}
