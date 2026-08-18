/* @jsxImportSource @opentui/react */
import React from "react";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { ScrollView } from "@/apps/cli/opentui/scroll-view.js";

export interface ScrollAreaProps {
  height: number;
  focused?: boolean;
  showScrollbar?: boolean;
  children: React.ReactNode;
}

/**
 * Scrollable region.
 *
 * Wraps the existing `ScrollView`, which already delegates to OpenTUI's
 * `scrollbox`: the renderer owns scroll offset, thumb size and culling, so
 * nothing in Reqraft tracks `scrollTop` by hand. This primitive only binds the
 * theme, so callers never pass a colour.
 */
export function ScrollArea({
  height,
  focused = false,
  showScrollbar = true,
  children,
}: Readonly<ScrollAreaProps>): React.ReactNode {
  return (
    <ScrollView
      height={height}
      focused={focused}
      showScrollbar={showScrollbar}
      scrollbarColor={theme.tokens.color.border}
      thumbColor={theme.tokens.color.accent}
    >
      {children}
    </ScrollView>
  );
}
