import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";
import type { PanelTone } from "../theme/types.js";

/**
 * The structural unit of the interface.
 *
 * A panel is a bordered box with a two-part header: the title on the left,
 * behind a glyph identifying the panel, and optional metadata on the right —
 * line counts, token counts, elapsed time.
 *
 * Tone conveys state through the border and title colour only. The reference
 * mockup tints panel backgrounds, which a terminal cannot do without assuming
 * its background colour (DA.md section 21).
 */
export interface PanelProps {
  title: string;
  /** Glyph before the title. Pass a theme symbol, never a literal. */
  glyph?: string;
  /** Right side of the header: counts, timings, state. */
  meta?: string;
  tone?: PanelTone;
  children: React.ReactNode;
}

function toneColor(tone: PanelTone): string | undefined {
  if (tone === "primary") return theme.color.borderFocused;
  if (tone === "success") return theme.color.success;
  if (tone === "danger") return theme.color.danger;
  return theme.color.border;
}

export function Panel({
  title,
  glyph,
  meta,
  tone = "secondary",
  children,
}: Readonly<PanelProps>): React.JSX.Element {
  const accent = toneColor(tone);

  if (tone === "inline") {
    return (
      <Box flexDirection="column" paddingX={1} marginBottom={theme.spacing.sm}>
        <Text bold>{title}</Text>
        {children}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle={tone === "secondary" ? theme.border.secondary : theme.border.primary}
      borderColor={accent}
      paddingX={1}
      marginBottom={theme.spacing.sm}
    >
      <Box justifyContent="space-between">
        <Text bold color={tone === "secondary" ? undefined : accent} wrap="truncate-end">
          {glyph ? `${glyph} ` : ""}
          {title}
        </Text>
        {meta !== undefined && meta !== "" && (
          <Text dimColor wrap="truncate-end">
            {meta}
          </Text>
        )}
      </Box>
      {children}
    </Box>
  );
}
