import process from "node:process";
import { detectColor } from "./theme/capabilities.js";

interface TextOutput {
  log(message: string): void;
}

export function printScreen(title: string, subtitle?: string, output: TextOutput = console): void {
  output.log(`\n${color(title, "36")}`);
  if (subtitle) output.log(color(subtitle, "2"));
  output.log(color("----------------------------------------", "90"));
}

export function printKeyValue(label: string, value: string, output: TextOutput = console): void {
  output.log(`  ${color(label.padEnd(18), "2")} ${value}`);
}

/**
 * Colour policy for the non-interactive renderer.
 *
 * Delegates to the same detection the TUI theme uses, so both surfaces answer
 * identically for a given terminal.
 */
export function supportsColor(): boolean {
  return detectColor(process.env, process.stdout.isTTY);
}

function color(value: string, code: string): string {
  return supportsColor() ? `\x1b[${code}m${value}\x1b[0m` : value;
}
