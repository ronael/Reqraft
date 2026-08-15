/* @jsxImportSource @opentui/react */
import { COLOR } from "./theme.js";
import { ScrollView } from "./scroll-view.js";
import { wrapText } from "./text.js";

/** Diff rows tinted like the landing's −/+ rows (CLI v2, docs/design/cli-v2.md). */

const DIFF_REMOVED_COLOR = "#fca5b0";
const DIFF_ADDED_COLOR = "#a7e9cd";

function diffLineColor(line: string): string {
  if (line.startsWith("- ")) {
    return DIFF_REMOVED_COLOR;
  }
  if (line.startsWith("+ ")) {
    return DIFF_ADDED_COLOR;
  }
  return COLOR.muted;
}

export function DiffViewport({
  text,
  rows,
  width,
  focused,
}: Readonly<{
  text: string;
  rows: number;
  width: number;
  focused: boolean;
}>): React.ReactNode {
  const visibleRows = Math.max(1, rows);
  const lineWidth = Math.max(1, width - 1);
  const viewportLines = wrapText(text, lineWidth);
  const renderLines = [...viewportLines];
  while (renderLines.length < visibleRows) renderLines.push("");

  return (
    <box style={{ flexDirection: "column", height: visibleRows, flexGrow: 0 }}>
      <ScrollView
        height={visibleRows}
        focused={focused}
        showScrollbar={viewportLines.length > visibleRows}
        scrollbarColor={COLOR.border}
        thumbColor={COLOR.accent}
      >
        {renderLines.map((line, index) => (
          <text
            key={`${String(index)}-${line}`}
            fg={diffLineColor(line)}
            style={{ width: lineWidth }}
          >
            {line.slice(0, lineWidth).padEnd(lineWidth, " ") || " ".repeat(lineWidth)}
          </text>
        ))}
      </ScrollView>
    </box>
  );
}
