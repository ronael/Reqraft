import React, { useMemo } from "react";

export interface ScrollViewProps {
  height: number;
  contentHeight: number;
  scrollTop: number;
  children: React.ReactNode;
  showScrollbar?: boolean;
  scrollbarColor?: string;
  thumbColor?: string;
  trackChar?: string;
  thumbChar?: string;
}

export function ScrollView({
  height,
  contentHeight,
  scrollTop,
  children,
  showScrollbar = true,
  scrollbarColor = "#3f3f46",
  thumbColor = "#a78bfa",
  trackChar = "│",
  thumbChar = "█",
}: ScrollViewProps): React.ReactNode {
  const visibleRows = Math.max(1, height);
  const maxScroll = Math.max(0, contentHeight - visibleRows);
  const clampedScroll = Math.min(maxScroll, Math.max(0, scrollTop));

  const thumbSize = useMemo(() => {
    if (contentHeight <= visibleRows) return visibleRows;
    return Math.max(1, Math.round((visibleRows / contentHeight) * visibleRows));
  }, [contentHeight, visibleRows]);

  const thumbPosition = useMemo(() => {
    if (contentHeight <= visibleRows || maxScroll === 0) return 0;
    return Math.round((clampedScroll / maxScroll) * (visibleRows - thumbSize));
  }, [clampedScroll, contentHeight, maxScroll, thumbSize, visibleRows]);

  const scrollbar = useMemo(
    () =>
      Array.from({ length: visibleRows }, (_, index) => {
        const isThumb = index >= thumbPosition && index < thumbPosition + thumbSize;
        return { char: isThumb ? thumbChar : trackChar, isThumb };
      }),
    [thumbChar, thumbPosition, thumbSize, trackChar, visibleRows],
  );

  return (
    <box style={{ flexDirection: "row", height: visibleRows, overflow: "hidden" }}>
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          marginTop: -clampedScroll,
        }}
      >
        {children}
      </box>
      {showScrollbar && (
        <box style={{ flexDirection: "column", width: 1 }}>
          {scrollbar.map((segment, index) => (
            <text key={index} fg={segment.isThumb ? thumbColor : scrollbarColor}>
              {segment.char}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}
