/* @jsxImportSource @opentui/react */
import { COLOR, toneColorForText, type TextTone } from "./theme.js";
import { ScrollView } from "./scroll-view.js";
import { wrapText } from "./text.js";

export function TextViewport({
  text,
  rows,
  width,
  tone = "text",
  scrollable = true,
  focused = false,
}: Readonly<{
  text: string;
  rows: number;
  width: number;
  tone?: TextTone;
  scrollable?: boolean;
  focused?: boolean;
}>): React.ReactNode {
  const visibleRows = Math.max(1, rows);
  const lineWidth = Math.max(1, width - (scrollable ? 1 : 0));
  const viewportLines = wrapText(text, lineWidth);
  const shouldShowScrollbar = scrollable && viewportLines.length > visibleRows;
  const renderLines = [...viewportLines];
  while (renderLines.length < visibleRows) renderLines.push("");

  return (
    <box
      style={{
        flexDirection: "column",
        height: visibleRows,
        flexGrow: 0,
      }}
    >
      <ScrollView
        height={visibleRows}
        focused={focused && scrollable}
        showScrollbar={shouldShowScrollbar}
        scrollbarColor={COLOR.border}
        thumbColor={tone === "error" ? COLOR.error : COLOR.accent}
      >
        {renderLines.map((line, index) => (
          <text key={`${String(index)}-${line}`} fg={toneColorForText(tone)} style={{ width: lineWidth }}>
            {line.slice(0, lineWidth).padEnd(lineWidth, " ") || " ".repeat(lineWidth)}
          </text>
        ))}
      </ScrollView>
    </box>
  );
}
