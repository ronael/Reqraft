import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";
import { version } from "../../version.js";
import { getHeaderLayout, HEADER_BASELINE, type HeaderStatus } from "../header-status.js";
import { StatusPill } from "./badge.js";

/**
 * Product identity and current context.
 *
 * The identity and the state are never dropped. Everything else yields to the
 * available width, measured rather than guessed from a layout mode.
 */
export function HeaderBar({
  provider,
  model,
  width,
  status,
}: Readonly<{
  provider: string;
  model: string;
  width: number;
  status: HeaderStatus;
}>): React.JSX.Element {
  const identity = `reqraft ${version}`;
  const layout = getHeaderLayout(width, identity, provider, model, status.label);

  return (
    <Box justifyContent="space-between" marginBottom={theme.spacing.sm}>
      <Box>
        <Text bold color={theme.color.accent}>
          reqraft
        </Text>
        <Text dimColor> {version}</Text>
        {layout.showBaseline && <Text dimColor> · {HEADER_BASELINE}</Text>}
      </Box>
      <Box>
        <Text dimColor wrap="truncate-end">
          {provider}
          {layout.showModel ? ` · ${model}` : ""}
        </Text>
        <Text> </Text>
        <StatusPill tone={status.tone} label={status.label} />
      </Box>
    </Box>
  );
}
