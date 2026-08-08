import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";

/**
 * One keyboard shortcut: the key, then what it does.
 *
 * A disabled hint stays visible but dimmed, so the shortcut set does not
 * reflow as the state changes.
 */
export function KeyHint({
  keyLabel,
  action,
  disabled = false,
}: Readonly<{
  keyLabel: string;
  action: string;
  disabled?: boolean;
}>): React.JSX.Element {
  return (
    <Box marginRight={theme.spacing.md}>
      <Text color={disabled ? undefined : theme.color.accent} dimColor={disabled} bold={!disabled}>
        {keyLabel}
      </Text>
      <Text dimColor> {action}</Text>
    </Box>
  );
}
