export interface ClippedText {
  lines: string[];
  hiddenBelow: number;
  hiddenAbove?: number;
}

/**
 * Fits text into the rows a panel can afford.
 *
 * DA.md section 18 forbids truncating a result silently, so the caller is told
 * how many lines were left out and can say so. Nothing is ever dropped from the
 * underlying value — copying still yields the whole prompt.
 */
export function clipLines(text: string, maxLines: number): ClippedText {
  const lines = text.split("\n");
  if (maxLines <= 0 || lines.length <= maxLines) {
    return { lines, hiddenBelow: 0 };
  }
  return { lines: lines.slice(0, maxLines), hiddenBelow: lines.length - maxLines };
}

/**
 * Rows the result panel may use.
 *
 * Priority order from DA.md section 17: the input keeps its room, the result
 * gets what is left, and decoration yields first.
 */
export function resultRowBudget(rows: number): number {
  const CHROME_ROWS = 14;
  const MINIMUM = 3;
  return Math.max(MINIMUM, rows - CHROME_ROWS);
}

/**
 * Keeps the end of a growing text instead of its beginning.
 *
 * While a stream is in flight the newest lines are the interesting ones:
 * clipping the head would freeze the view once the text passes the budget, and
 * the sense of the answer being written would be lost.
 */
export function clipTailLines(text: string, maxLines: number): ClippedText {
  const lines = text.split("\n");
  if (maxLines <= 0 || lines.length <= maxLines) {
    return { lines, hiddenBelow: 0 };
  }
  return {
    lines: lines.slice(lines.length - maxLines),
    hiddenBelow: 0,
    hiddenAbove: lines.length - maxLines,
  };
}
