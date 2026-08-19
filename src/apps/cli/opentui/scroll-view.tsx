/* @jsxImportSource @opentui/react */
import React from "react";

export interface ScrollViewProps {
  height: number;
  children: React.ReactNode;
  focused?: boolean;
  showScrollbar?: boolean;
  scrollbarColor?: string;
  thumbColor?: string;
  /**
   * Stay glued to the bottom edge (a log/chat follow). OpenTUI suspends this
   * automatically as soon as the user scrolls up, so it never yanks the view.
   */
  sticky?: boolean;
}

export function ScrollView({
  height,
  children,
  focused = false,
  showScrollbar = true,
  scrollbarColor = "#3f3f46",
  thumbColor = "#a78bfa",
  sticky = false,
}: Readonly<ScrollViewProps>): React.ReactNode {
  const fixedHeight = Math.max(1, height);

  return (
    <scrollbox
      focused={focused}
      height={fixedHeight}
      minHeight={fixedHeight}
      maxHeight={fixedHeight}
      width="100%"
      maxWidth="100%"
      flexGrow={0}
      flexShrink={0}
      overflow="hidden"
      scrollY
      scrollX={false}
      viewportCulling
      stickyScroll={sticky}
      stickyStart={sticky ? "bottom" : undefined}
      rootOptions={{
        height: fixedHeight,
        minHeight: fixedHeight,
        maxHeight: fixedHeight,
        flexGrow: 0,
        flexShrink: 0,
        overflow: "hidden",
      }}
      wrapperOptions={{
        height: fixedHeight,
        minHeight: fixedHeight,
        maxHeight: fixedHeight,
        flexGrow: 1,
        flexShrink: 1,
        overflow: "hidden",
      }}
      viewportOptions={{
        height: fixedHeight,
        minHeight: fixedHeight,
        maxHeight: fixedHeight,
        flexGrow: 0,
        flexShrink: 0,
        overflow: "hidden",
      }}
      verticalScrollbarOptions={{
        width: showScrollbar ? 1 : 0,
        showArrows: false,
        trackOptions: {
          foregroundColor: thumbColor,
          backgroundColor: scrollbarColor,
        },
      }}
      contentOptions={{
        flexDirection: "column",
        width: "100%",
        maxWidth: "100%",
        flexGrow: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </scrollbox>
  );
}
