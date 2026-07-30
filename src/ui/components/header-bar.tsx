import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";
import { version } from "../../version.js";
import type { HeaderStatus } from "../header-status.js";
import { StatusPill } from "./badge.js";

const BASELINE = "Shape the request. Keep the intent.";

/**
 * Product identity and current context.
 *
 * Metadata is shed before the identity: on a narrow terminal the baseline goes
 * first, then the model, so the header never wraps (DA.md section 16).
 */
export function HeaderBar({
  provider,
  model,
  compact,
  status,
}: Readonly<{
  provider: string;
  model: string;
  compact: boolean;
  status: HeaderStatus;
}>): React.JSX.Element {
  return (
    <Box justifyContent="space-between" marginBottom={theme.spacing.sm}>
      <Box>
        <Text bold color={theme.color.accent}>
          reqraft
        </Text>
        <Text dimColor> {version}</Text>
        {!compact && <Text dimColor> · {BASELINE}</Text>}
      </Box>
      <Box>
        <Text dimColor wrap="truncate-end">
          {provider}
          {compact ? "" : ` · ${model}`}
        </Text>
        <Text> </Text>
        <StatusPill tone={status.tone} label={status.label} />
      </Box>
    </Box>
  );
}
