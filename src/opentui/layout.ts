export interface MouseZone {
  id: "profile" | "level" | "provider" | "model";
  row: number;
  start: number;
  end: number;
}

export interface Layout {
  width: number;
  height: number;
  textWidth: number;
  compact: boolean;
  editorRows: number;
  resultRows: number;
  warningRows: number;
  actionRows: number;
  contextRow: number;
  badgeZones: MouseZone[];
  pickerTop: number;
  pickerLeft: number;
  pickerWidth: number;
}

const LAYOUT = {
  minWidth: 48,
  maxWidth: 118,
  minHeight: 18,
  compactWidth: 92,
  compactHeight: 28,
  rootPaddingRows: { compact: 0, regular: 2 },
  sectionGapRows: { compact: 0, regular: 4 },
  headerRows: 1,
  contextRows: { compact: 1, regular: 3 },
  panelFrameRows: 5,
  resultExtraRows: 2,
  footerRows: { compact: 2, regular: 1 },
  footerSafetyRows: 1,
  warningRows: { compact: 1, regular: 2 },
  picker: {
    top: { compact: 2, regular: 4 },
    left: { compact: 1, regular: 4 },
    width: { compact: 62, regular: 74 },
  },
} as const;

export function createLayout(
  width: number,
  height: number,
  provider: string,
  model: string,
): Layout {
  const normalizedWidth = Math.max(LAYOUT.minWidth, Math.min(width || 100, LAYOUT.maxWidth));
  const normalizedHeight = Math.max(LAYOUT.minHeight, height || 30);
  const compact = normalizedWidth < LAYOUT.compactWidth || normalizedHeight < LAYOUT.compactHeight;
  const warningRows = compact ? LAYOUT.warningRows.compact : LAYOUT.warningRows.regular;
  const rootPaddingRows = compact ? LAYOUT.rootPaddingRows.compact : LAYOUT.rootPaddingRows.regular;
  const interSectionGaps = compact ? LAYOUT.sectionGapRows.compact : LAYOUT.sectionGapRows.regular;
  const actionRows = compact ? LAYOUT.footerRows.compact : LAYOUT.footerRows.regular;
  const contextRows = compact ? LAYOUT.contextRows.compact : LAYOUT.contextRows.regular;
  const resultInternalRows = warningRows + LAYOUT.resultExtraRows;
  const footerReserveRows = actionRows + LAYOUT.footerSafetyRows;
  const fixedRows =
    rootPaddingRows +
    interSectionGaps +
    LAYOUT.headerRows +
    footerReserveRows +
    contextRows +
    LAYOUT.panelFrameRows * 2 +
    resultInternalRows;
  const contentRows = Math.max(4, normalizedHeight - fixedRows);
  const editorRows = Math.max(2, Math.min(compact ? 3 : 8, Math.floor(contentRows * 0.35)));
  const resultRows = Math.max(2, contentRows - editorRows - (compact ? 3 : 0));
  const contextRow =
    Math.floor(rootPaddingRows / 2) +
    LAYOUT.headerRows +
    (compact ? 0 : 1) +
    LAYOUT.panelFrameRows +
    editorRows +
    (compact ? 0 : 1);
  const pickerTop = compact ? LAYOUT.picker.top.compact : LAYOUT.picker.top.regular;
  const pickerLeft = compact ? LAYOUT.picker.left.compact : LAYOUT.picker.left.regular;
  const pickerWidth = compact ? LAYOUT.picker.width.compact : LAYOUT.picker.width.regular;
  const labels = [
    ["profile", "profil auto ^P"],
    ["level", "niveau standard ^L"],
    ["provider", `provider ${provider} ^I`],
    ["model", `modèle ${shortModel(model)} ^O`],
  ] as const;
  let cursor = compact ? 2 : 4;
  const badgeZones = labels.map(([id, label]) => {
    const start = cursor;
    const end = cursor + label.length + 3;
    cursor = end + 2;
    return { id, row: contextRow, start, end };
  });

  return {
    width: normalizedWidth,
    height: normalizedHeight,
    textWidth: Math.max(24, normalizedWidth - (compact ? 6 : 10)),
    compact,
    editorRows,
    resultRows,
    warningRows,
    actionRows,
    contextRow,
    badgeZones,
    pickerTop,
    pickerLeft,
    pickerWidth,
  };
}

export function pickerOptionIndexAt(
  layout: Layout,
  row: number,
  optionCount: number,
): number | null {
  const firstOptionRow = layout.pickerTop + 4;
  const relative = row - firstOptionRow;
  if (relative < 0) return null;
  const index = Math.floor(relative / 2);
  if (relative % 2 !== 0 || index >= optionCount) return null;
  return index;
}

function shortModel(model: string): string {
  return model.length > 14 ? `${model.slice(0, 11)}…` : model;
}
