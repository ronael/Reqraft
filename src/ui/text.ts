import process from "node:process";

export function printScreen(title: string, subtitle?: string): void {
  console.log(`\n${color(title, "36")}`);
  if (subtitle) console.log(color(subtitle, "2"));
  console.log(color("----------------------------------------", "90"));
}

export function printKeyValue(label: string, value: string): void {
  console.log(`  ${color(label.padEnd(18), "2")} ${value}`);
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
