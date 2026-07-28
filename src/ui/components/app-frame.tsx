import React from "react";
import { Box } from "ink";
import type { LayoutMode } from "../layout/responsive.js";

export function AppFrame({
  mode,
  width,
  children,
}: {
  mode: LayoutMode;
  width: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box
      flexDirection="column"
      width={width}
      alignSelf="center"
      paddingX={mode === "narrow" ? 0 : 1}
    >
      {children}
    </Box>
  );
}
