/* @jsxImportSource @opentui/react */
import React from "react";
import { theme } from "@/apps/cli/tui/theme/index.js";

export interface StackProps {
  direction?: "row" | "column";
  /** Token name rather than a cell count, so spacing stays global. */
  gap?: keyof typeof theme.tokens.spacing;
  justify?: "flex-start" | "center" | "flex-end" | "space-between";
  align?: "flex-start" | "center" | "flex-end" | "stretch";
  grow?: boolean;
  children?: React.ReactNode;
}

/** Layout primitive. Exists so components never spell out flex props. */
export function Stack({
  direction = "column",
  gap = "none",
  justify = "flex-start",
  align = "stretch",
  grow = false,
  children,
}: Readonly<StackProps>): React.ReactNode {
  return (
    <box
      style={{
        flexDirection: direction,
        gap: theme.tokens.spacing[gap],
        justifyContent: justify,
        alignItems: align,
        flexGrow: grow ? 1 : 0,
      }}
    >
      {children}
    </box>
  );
}
