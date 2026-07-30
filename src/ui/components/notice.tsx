import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";

import type { StatusTone } from "../theme/types.js";

export function Notice({
  tone,
  children,
}: Readonly<{
  tone: StatusTone;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <Box marginBottom={1}>
      {/* The symbol carries the meaning on its own, so a monochrome or
          NO_COLOR terminal loses nothing. */}
      <Text color={theme.color[tone]}>
        {theme.symbol[tone]} {children}
      </Text>
    </Box>
  );
}
