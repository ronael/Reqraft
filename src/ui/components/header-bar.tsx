import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";

export function HeaderBar({
  provider,
  model,
  compact,
}: {
  provider: string;
  model: string;
  compact: boolean;
}): React.JSX.Element {
  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Box>
        <Text bold color={theme.color.accent}>
          reqraft
        </Text>
        {!compact && <Text dimColor> atelier de formulation</Text>}
      </Box>
      <Text wrap="truncate-end">
        <Text color={theme.color.accentSoft}>{provider}</Text>
        {!compact && <Text dimColor> / {model}</Text>}
      </Text>
    </Box>
  );
}
