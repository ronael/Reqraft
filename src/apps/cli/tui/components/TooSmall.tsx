/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import type { Translator } from "@/i18n/translate.js";

export interface TooSmallProps {
  t: Translator;
}

/**
 * Explicit state for a terminal below the minimum size.
 *
 * Better than overflowing and corrupting the frame: a short message plus the
 * two actions that always work. The editor is not rendered, because there is
 * no room for it to be useful.
 */
export function TooSmall({ t }: Readonly<TooSmallProps>): React.ReactNode {
  const { color } = theme.tokens;
  return (
    <Stack direction="column" gap="xs" grow align="center" justify="center">
      <text attributes={TextAttributes.BOLD} fg={color.accent}>
        {t("tui.tooSmall.title")}
      </text>
      <text fg={color.textMuted}>{t("tui.tooSmall.body")}</text>
      <text fg={color.textMuted}>
        <span fg={color.accent}>{"^C"}</span>
        <span>{"  "}</span>
        <span fg={color.accent}>{"?"}</span>
      </text>
    </Stack>
  );
}
