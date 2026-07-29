import React from "react";
import { Box, Text } from "ink";
import type { RepromptResult } from "../../core/types.js";

export function MetaRow({ result }: Readonly<{ result: RepromptResult }>): React.JSX.Element {
  const values = [
    result.latencyMs === undefined ? undefined : formatDuration(result.latencyMs),
    formatTokens("entrée", result.usage?.inputTokens),
    formatTokens("sortie", result.usage?.visibleOutputTokens),
  ].filter((value): value is string => Boolean(value));

  return (
    <Box marginTop={1}>
      <Text dimColor>{values.join("  ·  ")}</Text>
    </Box>
  );
}

function formatDuration(milliseconds: number): string {
  return milliseconds < 1000
    ? `${String(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
}

function formatTokens(label: string, tokens: number | undefined): string | undefined {
  return tokens === undefined ? undefined : `${String(tokens)} tokens ${label}`;
}
