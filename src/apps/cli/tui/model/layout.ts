import { LAYOUT, type LayoutTokens } from "@/apps/cli/tui/theme/tokens.js";

/**
 * Responsive decisions, in one place.
 *
 * Every `width < 100` scattered through components is a rule nobody can find
 * later. Components ask for a mode; this module owns the thresholds, and the
 * thresholds themselves come from `tokens.layout` so they stay tunable with
 * the rest of the design.
 *
 * There is exactly one composition — the vertical transcript — and the modes
 * only reduce how much of it is shown. There is no horizontal split: a prompt
 * and its result read top-to-bottom, even on a very wide terminal, so the
 * editor stays where the eye lands last and the transcript stays scrollable.
 */

export type LayoutMode = "standard" | "compact" | "too-small";

export interface LayoutDecision {
  mode: LayoutMode;
  /** Secondary metadata (model/provider shortcuts) is dropped. */
  showMetadata: boolean;
  /** The shortcut footer is dropped rather than wrapped. */
  showStatusBar: boolean;
  /** Rows the editor may use; never zero, so the prompt stays usable. */
  editorRows: number;
  /** Rows the transcript may use; never zero, so a result stays reachable. */
  transcriptRows: number;
  headerRows: number;
  footerRows: number;
}

export function resolveLayoutMode(
  width: number,
  height: number,
  layout: LayoutTokens = LAYOUT,
): LayoutMode {
  if (width < layout.minimumWidth || height < layout.minimumHeight) {
    return "too-small";
  }
  return height <= layout.compactMaximumHeight ? "compact" : "standard";
}

/**
 * Degradation order, made explicit: metadata goes first, then the status bar,
 * then everything below the minimum. The editor is never what gets sacrificed
 * — a prompt you cannot see is not a smaller interface, it is a broken one.
 * The transcript is what scrolls, so it simply shrinks as space tightens.
 */
export function resolveLayout(
  width: number,
  height: number,
  layout: LayoutTokens = LAYOUT,
): LayoutDecision {
  const mode = resolveLayoutMode(width, height, layout);
  const headerRows = 1;
  const footerRows = 1;
  const editorRows = Math.max(1, Math.min(8, Math.floor(height / 5)));

  const base = {
    mode,
    headerRows,
    footerRows,
    editorRows,
  };

  switch (mode) {
    case "compact":
      return {
        ...base,
        showMetadata: false,
        showStatusBar: true,
        transcriptRows: Math.max(
          1,
          height - headerRows - editorRows - footerRows - (footerRows + 1) * 1 - 1,
        ),
      };
    case "standard":
      return {
        ...base,
        showMetadata: true,
        showStatusBar: true,
        transcriptRows: Math.max(
          1,
          height - headerRows - editorRows - footerRows - (footerRows + 1) * 1 - 1,
        ),
      };
    default:
      // Below the minimum the interface stops pretending: one editor, one
      // line of guidance, nothing that could overflow and corrupt the frame.
      return {
        ...base,
        showMetadata: false,
        showStatusBar: false,
        transcriptRows: 0,
      };
  }
}
