import React from "react";
import { Box } from "ink";
import { getShortcutHints } from "../shortcut-hints.js";
import { KeyHint } from "./key-hint.js";

export function ShortcutBar({
  compact,
  hasResult,
  isGenerating = false,
}: Readonly<{
  compact: boolean;
  hasResult: boolean;
  isGenerating?: boolean;
}>): React.JSX.Element {
  return (
    <Box flexWrap="wrap">
      {getShortcutHints({ compact, hasResult, isGenerating }).map((hint) => (
        <KeyHint
          key={hint.keyLabel}
          keyLabel={hint.keyLabel}
          action={hint.action}
          disabled={hint.disabled}
        />
      ))}
    </Box>
  );
}
