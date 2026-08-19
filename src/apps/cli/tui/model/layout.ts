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
 *
 * The height budget is exact. `editorHeight` is the FULL height of the prompt
 * surface — borders, title, padding and the textarea — not just the textarea,
 * so the invariant below always holds:
 *
 *   header + gaps + transcript + editorHeight + statusBar <= terminal height
 */

export type LayoutMode = "standard" | "compact" | "too-small";

/** Rows a titled Surface adds around its editor child, per density. */
export interface EditorOverhead {
  comfortable: number;
  compact: number;
}

export const DEFAULT_EDITOR_OVERHEAD: EditorOverhead = { comfortable: 5, compact: 3 };

export interface LayoutDecision {
  mode: LayoutMode;
  /** The header row (identity + context) is shown. */
  showHeader: boolean;
  /** Per-setting shortcuts/metadata inside the header are shown. */
  showMetadata: boolean;
  /** The shortcut footer is dropped rather than wrapped. */
  showStatusBar: boolean;
  /** Rows the textarea may use; never zero, so the prompt stays usable. */
  editorRows: number;
  /** Full height the prompt surface consumes, including borders/title/padding. */
  editorHeight: number;
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

function editorOverheadFor(mode: LayoutMode, overhead: EditorOverhead): number {
  return mode === "compact" ? overhead.compact : overhead.comfortable;
}

export function resolveLayout(
  width: number,
  height: number,
  layout: LayoutTokens = LAYOUT,
  overhead: EditorOverhead = DEFAULT_EDITOR_OVERHEAD,
): LayoutDecision {
  const mode = resolveLayoutMode(width, height, layout);
  const { gap } = layout;

  if (mode === "too-small") {
    return {
      mode,
      showHeader: false,
      showMetadata: false,
      showStatusBar: false,
      editorRows: 1,
      editorHeight: 1,
      transcriptRows: 0,
      headerRows: 0,
      footerRows: 0,
    };
  }

  const showHeader = true;
  const showMetadata = mode === "standard";
  const showStatusBar = true;
  const headerRows = 1;
  const footerRows = 1;
  // Root gaps separate Header/Stack/StatusBar (2), and the Stack adds one more
  // between transcript and editor (1). Header and StatusBar are always present
  // outside the too-small branch, so this is fixed.
  const gapCount = 3;
  const fixed = headerRows + footerRows + gapCount * gap;
  const surfaceOverhead = editorOverheadFor(mode, overhead);

  // The editor is the most important fixed region: size it to the terminal,
  // then give the transcript whatever is left, shrinking the editor if that
  // would leave the transcript with nothing to scroll.
  const desiredEditorRows = Math.max(1, Math.min(8, Math.floor(height / 5)));
  let editorHeight = desiredEditorRows + surfaceOverhead;
  let transcriptRows = height - fixed - editorHeight;
  if (transcriptRows < 1) {
    editorHeight = Math.max(height - fixed - 1, surfaceOverhead + 1);
    transcriptRows = height - fixed - editorHeight;
  }

  // editorHeight is kept at least `surfaceOverhead + 1`, so the textarea keeps
  // at least one row by construction.
  const editorRows = editorHeight - surfaceOverhead;

  return {
    mode,
    showHeader,
    showMetadata,
    showStatusBar,
    editorRows,
    editorHeight,
    transcriptRows: Math.max(1, transcriptRows),
    headerRows,
    footerRows,
  };
}
