import { LAYOUT, type LayoutTokens } from "@/apps/cli/tui/theme/tokens.js";

/**
 * Responsive decisions, in one place.
 *
 * Every `width < 100` scattered through components is a rule nobody can find
 * later. Components ask for a mode; this module owns the thresholds, and the
 * thresholds themselves come from `tokens.layout` so they stay tunable with
 * the rest of the design.
 */

export type LayoutMode = "wide" | "normal" | "compact" | "too-small";

export interface LayoutDecision {
  mode: LayoutMode;
  /** Result sits beside the editor rather than under it. */
  splitColumns: boolean;
  /** Secondary metadata (model, provider, timings) is dropped. */
  showMetadata: boolean;
  /** The shortcut footer is dropped rather than wrapped. */
  showStatusBar: boolean;
  /** Rows the editor may use; never zero, so the prompt stays usable. */
  editorRows: number;
}

export function resolveLayoutMode(
  width: number,
  height: number,
  layout: LayoutTokens = LAYOUT,
): LayoutMode {
  if (width < layout.minimumWidth || height < layout.minimumHeight) {
    return "too-small";
  }
  if (width >= layout.splitMinimumWidth && height > layout.compactMaximumHeight) {
    return "wide";
  }
  if (height <= layout.compactMaximumHeight) {
    return "compact";
  } else {
    return "normal";
  }
}

/**
 * Degradation order, made explicit: metadata goes first, then the split, then
 * the status bar. The editor is never what gets sacrificed — a prompt you
 * cannot see is not a smaller interface, it is a broken one.
 */
export function resolveLayout(
  width: number,
  height: number,
  layout: LayoutTokens = LAYOUT,
): LayoutDecision {
  const mode = resolveLayoutMode(width, height, layout);
  const editorRows = Math.max(1, Math.min(8, Math.floor(height / 4)));

  switch (mode) {
    case "wide":
      return {
        mode,
        splitColumns: true,
        showMetadata: true,
        showStatusBar: true,
        editorRows,
      };
    case "normal":
      return {
        mode,
        splitColumns: false,
        showMetadata: true,
        showStatusBar: true,
        editorRows,
      };
    case "compact":
      return {
        mode,
        splitColumns: false,
        showMetadata: false,
        showStatusBar: true,
        editorRows,
      };
    default:
      // Below the minimum the interface stops pretending: one editor, one
      // line of guidance, nothing that could overflow and corrupt the frame.
      return {
        mode,
        splitColumns: false,
        showMetadata: false,
        showStatusBar: false,
        editorRows: 1,
      };
  }
}
