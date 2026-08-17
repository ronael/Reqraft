/* @jsxImportSource @opentui/react */
import { ScrollBoxRenderable } from "@opentui/core";
import { COLOR } from "../theme/tui.js";

/**
 * A real scroll area: OpenTUI's native `scrollbox` — wheel and keyboard
 * scrolling, a scrollbar that tracks the actual content size, and
 * `scrollChildIntoView` for programmatic positioning.
 *
 * The scrollbar is only shown while there is something to scroll; it is part
 * of the layout (one column), never a decorative overlay.
 */

export interface ScrollAreaProps {
  height: number;
  width?: number | "100%";
  children: React.ReactNode;
  /** Focus the scroll area (enables keyboard scrolling). */
  focused?: boolean;
  showScrollbar?: boolean;
  scrollbarColor?: string;
  thumbColor?: string;
  ref?: (box: ScrollBoxRenderable | null) => void;
}

export function ScrollArea({
  height,
  width = "100%",
  children,
  focused = false,
  showScrollbar = true,
  scrollbarColor = COLOR.border,
  thumbColor = COLOR.accent,
  ref,
}: ScrollAreaProps): React.ReactNode {
  const fixedHeight = Math.max(1, height);

  return (
    <scrollbox
      focused={focused}
      width={width}
      height={fixedHeight}
      minHeight={fixedHeight}
      maxHeight={fixedHeight}
      flexGrow={0}
      flexShrink={0}
      overflow="hidden"
      scrollY
      scrollX={false}
      viewportCulling
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
      ref={(renderable: ScrollBoxRenderable | null) => {
        ref?.(renderable);
      }}
    >
      {children}
    </scrollbox>
  );
}
