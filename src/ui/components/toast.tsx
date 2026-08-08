import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";
import type { StatusTone } from "../theme/types.js";

/**
 * Transient confirmation of a short action.
 *
 * The row is always mounted, even with nothing to say, so appearing and
 * disappearing never shifts the layout. Important failures
 * belong in the result panel, not here — a toast is not allowed to be the only
 * place an error is shown.
 */
export function Toast({
  message,
  tone = "success",
}: Readonly<{
  message: string | null;
  tone?: StatusTone;
}>): React.JSX.Element {
  return (
    <Box height={1}>
      {message !== null && (
        <Text color={theme.color[tone]} wrap="truncate-end">
          {theme.symbol[tone]} {message}
        </Text>
      )}
    </Box>
  );
}
