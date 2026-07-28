import React from "react";
import { Box, Text } from "ink";

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action: string;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text dimColor>{title}</Text>
      <Text dimColor>{action}</Text>
    </Box>
  );
}
