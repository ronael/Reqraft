/**
 * Surface palette of the interactive TUI (CLI v2 design).
 *
 * Built on the shared `PALETTE_VALUES` so the TUI, the CLI and the desktop
 * renderer stay on the exact same identity colours. The surface roles
 * (backgrounds, borders, text tiers) are TUI-specific.
 */
import { PALETTE_VALUES } from "./palette-values.js";

export const COLOR = {
  bg: "#09090b",
  panel: "#111113",
  panelSoft: "#17171a",
  border: "#3f3f46",
  borderSoft: "#27272a",
  text: "#e4e4e7",
  muted: "#71717a",
  subtle: "#a1a1aa",
  accent: PALETTE_VALUES.accent,
  accentStrong: PALETTE_VALUES.accentStrong,
  success: PALETTE_VALUES.success,
  warning: PALETTE_VALUES.warning,
  error: PALETTE_VALUES.danger,
} as const;

export type PanelTone = "accent" | "neutral" | "success" | "warning" | "error";
export type TextTone = "text" | "warning" | "error";

export function toneColor(tone: PanelTone): string {
  if (tone === "accent") return COLOR.accent;
  if (tone === "success") return COLOR.success;
  if (tone === "warning") return COLOR.warning;
  if (tone === "error") return COLOR.error;
  return COLOR.border;
}

export function toneColorForText(tone: TextTone): string {
  if (tone === "warning") return COLOR.warning;
  if (tone === "error") return COLOR.error;
  return COLOR.text;
}
