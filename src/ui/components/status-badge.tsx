import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";

export function StatusBadge({
  label,
  value,
}: Readonly<{ label: string; value: string }>): React.JSX.Element {
  return (
    <Box marginRight={2}>
      <Text dimColor>{label} </Text>
      <Text color={theme.color.textMuted}>{value}</Text>
    </Box>
  );
}
