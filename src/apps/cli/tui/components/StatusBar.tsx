/* @jsxImportSource @opentui/react */
import React from "react";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { KeyHint } from "@/apps/cli/tui/primitives/KeyHint.js";
import { statusBarCommands } from "@/apps/cli/tui/model/status-bar.js";
import type { CommandContext } from "@/apps/cli/tui/model/commands.js";
import type { Translator } from "@/i18n/translate.js";

export interface StatusBarProps {
  context: CommandContext;
  t: Translator;
}

/**
 * The shortcut footer.
 *
 * Reads a contextually chosen set of commands from the same registry the
 * keyboard router reads, so the bar can neither advertise a key the handler
 * does not implement nor show the same key twice for two behaviours. Result
 * actions stay beside the result, not here. Unavailable commands are shown
 * dimmed rather than hidden, so the bar does not reflow the moment a result
 * appears.
 */
export function StatusBar({ context, t }: Readonly<StatusBarProps>): React.ReactNode {
  const shown = statusBarCommands(context);

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
