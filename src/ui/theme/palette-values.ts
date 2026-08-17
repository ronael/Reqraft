/**
 * Raw Reqraft palette values — the single source of truth for every surface.
 *
 * Extracted from `palette.ts` so the desktop renderer can consume the exact
 * same hex values as the TUI without importing anything terminal-related
 * (DESKTOP.md §4). This module is pure by contract: no imports, no runtime
 * dependency, safe to bundle into any renderer.
 */
export const PALETTE_VALUES = {
  /** Violet — identity, focus, actions. */
  accent: "#a78bfa",
  accentStrong: "#8b5cf6",
  /** Status colours, reserved for success, warning and failure. */
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#fb7185",
} as const;

export type PaletteValue = (typeof PALETTE_VALUES)[keyof typeof PALETTE_VALUES];
