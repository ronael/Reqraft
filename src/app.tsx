import React from "react";
import { Box, Text } from "ink";

export function App(): React.JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>rp — mode interactif</Text>
      <Text>La TUI complète sera implémentée dans le Lot G.</Text>
    </Box>
  );
}
