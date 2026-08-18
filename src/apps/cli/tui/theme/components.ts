import type { Tokens } from "./tokens.js";

/**
 * Per-component tokens.
 *
 * `tokens.ts` answers "what does accent mean?"; this file answers "how much
 * padding does a panel have?". Splitting them means a component can be
 * restyled without touching the palette, and the palette can change without
 * re-deciding every layout value.
 *
 * Derived from the global tokens rather than hardcoded, so a change to
 * `spacing` still propagates here.
 */

export type SurfaceTone = "default" | "accent" | "success" | "warning" | "error";
export type Density = "comfortable" | "compact";

export interface ComponentTokens {
  surface: {
    paddingX: Record<Density, number>;
    paddingY: Record<Density, number>;
    gap: Record<Density, number>;
  };
  toolbar: {
    height: number;
    gap: number;
  };
  dialog: {
    /** Share of the terminal width, clamped by min/max below. */
    widthRatio: number;
    minimumWidth: number;
    maximumWidth: number;
    maximumHeightRatio: number;
    paddingX: number;
  };
  editor: {
    minimumHeight: number;
    paddingX: number;
  };
  statusBar: {
    height: number;
    gap: number;
  };
}

export function createComponentTokens(tokens: Tokens): ComponentTokens {
  const { spacing } = tokens;
  return {
    surface: {
      paddingX: { comfortable: spacing.sm, compact: spacing.xs },
      paddingY: { comfortable: spacing.xs, compact: spacing.none },
      gap: { comfortable: spacing.xs, compact: spacing.none },
    },
    toolbar: { height: 1, gap: spacing.sm },
    dialog: {
      widthRatio: 0.6,
      minimumWidth: 32,
      maximumWidth: 72,
      maximumHeightRatio: 0.7,
      paddingX: spacing.sm,
    },
    editor: { minimumHeight: 3, paddingX: spacing.xs },
    statusBar: { height: 1, gap: spacing.sm },
  };
}

/** Maps a semantic tone to the border colour that carries it. */
export function toneBorderColor(tokens: Tokens, tone: SurfaceTone, focused: boolean): string {
  if (focused) return tokens.color.borderFocused;
  switch (tone) {
    case "accent":
      return tokens.color.accent;
    case "success":
      return tokens.color.success;
    case "warning":
      return tokens.color.warning;
    case "error":
      return tokens.color.error;
    default:
      return tokens.color.border;
  }
}

/** Maps a semantic tone to the text colour used for its label. */
export function toneTextColor(tokens: Tokens, tone: SurfaceTone): string {
  switch (tone) {
    case "accent":
      return tokens.color.accent;
    case "success":
      return tokens.color.success;
    case "warning":
      return tokens.color.warning;
    case "error":
      return tokens.color.error;
    default:
      return tokens.color.text;
  }
}
