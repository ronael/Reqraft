import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";
import type { StatusTone } from "../theme/types.js";

/**
 * A labelled contextual value: profile, level, provider, model.
 *
 * Both parts stay neutral. In the reference mockup these badges are grey —
 * colour is reserved for focus and status, so the eye lands on what changed.
 */
export function Badge({
  label,
  value,
}: Readonly<{ label: string; value: string }>): React.JSX.Element {
  return (
    <Box marginRight={theme.spacing.md}>
      <Text dimColor>{label} </Text>
      <Text wrap="truncate-end">{value}</Text>
    </Box>
  );
}

/**
 * A short state marker such as "prêt", "génération", "terminé".
 *
 * The symbol precedes the label so the state survives a monochrome terminal.
 */
export function StatusPill({
  tone,
  label,
}: Readonly<{ tone: StatusTone; label: string }>): React.JSX.Element {
  return (
    <Text color={theme.color[tone]} wrap="truncate-end">
      {theme.symbol[tone]} {label}
    </Text>
  );
}
