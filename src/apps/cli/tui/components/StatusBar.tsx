/* @jsxImportSource @opentui/react */
import React from "react";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { KeyHint } from "@/apps/cli/tui/primitives/KeyHint.js";
import { COMMANDS, type CommandContext } from "@/apps/cli/tui/model/commands.js";
import type { Translator } from "@/i18n/translate.js";

export interface StatusBarProps {
  context: CommandContext;
  t: Translator;
  /** Cap on hints shown, so a narrow terminal does not wrap the row. */
  limit?: number;
}

/**
 * The shortcut footer.
 *
 * Reads the same registry the keyboard router reads, and shows unavailable
 * commands dimmed rather than hiding them, so the bar does not reflow the
 * moment a result appears. Commands without a chord are skipped: advertising
 * a blank key helps nobody.
 */
export function StatusBar({ context, t, limit = 6 }: Readonly<StatusBarProps>): React.ReactNode {
  const shown = COMMANDS.filter((command) => command.chords.length > 0).slice(0, limit);

  return (
    <Stack direction="row" gap="sm">
      {shown.map((command) => (
        <KeyHint
          key={command.id}
          command={command}
          t={t}
          disabled={!command.isAvailable(context)}
        />
      ))}
    </Stack>
  );
}
