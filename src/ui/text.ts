import process from "node:process";

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

export function shouldUseColor(streamIsTty: boolean, noColor: string | undefined): boolean {
  return streamIsTty && noColor === undefined;
}

export function supportsColor(): boolean {
  return shouldUseColor(process.stdout.isTTY, process.env.NO_COLOR);
}

function color(value: string, code: string): string {
  return supportsColor() ? `\x1b[${code}m${value}\x1b[0m` : value;
}
