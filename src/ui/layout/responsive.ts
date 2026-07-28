export type LayoutMode = "narrow" | "compact" | "wide";

export function getLayoutMode(columns: number): LayoutMode {
  if (columns < 52) return "narrow";
  if (columns < 76) return "compact";
  return "wide";
}

export function getFrameWidth(columns: number): number {
  return Math.max(20, Math.min(columns, 112));
}
