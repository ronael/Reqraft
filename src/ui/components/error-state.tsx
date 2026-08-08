import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";
import type { UiError } from "../errors.js";

/**
 * A failure the user can act on.
 *
 * Structure required by the TUI implementation brief sections 13: title, message, cause when known,
 * and the next action. Stack traces, payloads, headers and keys never appear
 * here — `--verbose` puts technical detail on stderr instead.
 */
export function ErrorState({ error }: Readonly<{ error: UiError }>): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text color={theme.color.danger} bold>
        {theme.symbol.danger} {error.title}
      </Text>
      <Box marginTop={theme.spacing.sm}>
        <Text>{error.message}</Text>
      </Box>
      {error.cause !== undefined && (
        <Box marginTop={theme.spacing.sm}>
          <Text dimColor>{error.cause}</Text>
        </Box>
      )}
      {error.nextAction !== undefined && (
        <Box marginTop={theme.spacing.sm}>
          <Text color={theme.color.accent}>
            {theme.symbol.arrow} {error.nextAction}
          </Text>
        </Box>
      )}
    </Box>
  );
}
