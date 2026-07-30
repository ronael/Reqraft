import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";

/**
 * A panel with nothing to show yet.
 *
 * States what is missing, then points at the action that fills it. The arrow
 * glyph mirrors the mockup and degrades to ASCII.
 */
export function EmptyState({
  title,
  action,
}: Readonly<{
  title: string;
  action: string;
}>): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text dimColor>{title}</Text>
      <Text dimColor>
        {theme.symbol.arrow} {action}
      </Text>
    </Box>
  );
}
