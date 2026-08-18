export type LayoutMode = "narrow" | "compact" | "wide";

/** Vertical budget. `short` drops decoration to keep input and result visible. */
export type HeightMode = "short" | "regular";

export interface TerminalSize {
  columns: number;
  rows: number;
}

/**
 * Used when the terminal reports nothing — `process.stdout.columns` is
 * undefined off a TTY, and propagating that produces a NaN layout.
 */
export const FALLBACK_SIZE: TerminalSize = { columns: 80, rows: 24 };

const MIN_COLUMNS = 20;
const MAX_FRAME_WIDTH = 112;
const COMPACT_FROM = 52;
const WIDE_FROM = 76;
const SHORT_BELOW = 20;

export function normalizeSize(size: Partial<TerminalSize>): TerminalSize {
  return {
    columns: usableDimension(size.columns, FALLBACK_SIZE.columns),
    rows: usableDimension(size.rows, FALLBACK_SIZE.rows),
  };
}

export function getLayoutMode(columns: number): LayoutMode {
  if (columns < COMPACT_FROM) return "narrow";
  if (columns < WIDE_FROM) return "compact";
  return "wide";
}

export function getHeightMode(rows: number): HeightMode {
  return rows < SHORT_BELOW ? "short" : "regular";
}

export function getFrameWidth(columns: number): number {
  return Math.max(MIN_COLUMNS, Math.min(columns, MAX_FRAME_WIDTH));
}

function usableDimension(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
