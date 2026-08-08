export const COLOR = {
  bg: "#09090b",
  panel: "#111113",
  panelSoft: "#17171a",
  border: "#3f3f46",
  borderSoft: "#27272a",
  text: "#e4e4e7",
  muted: "#71717a",
  subtle: "#a1a1aa",
  accent: "#a78bfa",
  success: "#34d399",
  warning: "#fbbf24",
  error: "#fb7185",
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
