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
    /** Darkens the application behind an open modal without hiding it. */
    backdropOpacity: number;
  };
  editor: {
    minimumHeight: number;
    paddingX: number;
    /** Rows a Surface with a title adds around its child (borders + title + paddingY). */
    overhead: Record<Density, number>;
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
      // Monochrome terminals need the underlying content to remain legible;
      // their palette cannot express a useful dimmed layer.
      backdropOpacity: tokens.color.background === "black" ? 0 : 0.72,
    },
    editor: {
      minimumHeight: 3,
      paddingX: spacing.xs,
      overhead: {
        comfortable: 2 + 1 + 2 * spacing.xs,
        compact: 2 + 1 + 2 * spacing.none,
      },
    },
    statusBar: { height: 1, gap: spacing.sm },
  };
}

/**
 * The rows a titled Surface consumes around its child: top and bottom borders,
 * the title row, and the vertical padding on each side. Layout uses this so
 * the editor's total height (not just the textarea) fits the terminal budget.
 */
export function editorSurfaceOverhead(components: ComponentTokens, density: Density): number {
  return components.editor.overhead[density];
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
