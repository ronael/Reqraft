import { Box, Text } from "ink";
import React from "react";
import type { RepromptResult } from "../../core/types.js";
import { formatDuration, formatTokenMetric } from "../formatters.js";

export function MetaRow({ result }: Readonly<{ result: RepromptResult }>): React.JSX.Element {
  const values = [
    result.latencyMs === undefined ? undefined : formatDuration(result.latencyMs),
    formatTokenMetric("entrée", result.usage?.inputTokens),
    formatTokenMetric("sortie", result.usage?.visibleOutputTokens),
  ].filter((value): value is string => Boolean(value));

  return (
    <Box marginTop={1} overflowY={'visible'} height={2}>
      <Text dimColor>{values.join("  ·  ")}</Text>
    </Box>
  );
}
