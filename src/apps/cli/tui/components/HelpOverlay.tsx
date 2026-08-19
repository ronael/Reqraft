/* @jsxImportSource @opentui/react */
import React from "react";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { Dialog } from "@/apps/cli/tui/primitives/Dialog.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import {
  COMMANDS,
  commandKeyLabel,
  type CommandId,
  type CommandLabelKey,
} from "@/apps/cli/tui/model/commands.js";
import type { Translator } from "@/i18n/translate.js";

export interface HelpOverlayProps {
  open: boolean;
  terminalWidth: number;
  terminalHeight: number;
  t: Translator;
}

/**
 * Group headings have their own keys rather than borrowing a command's label:
 * reusing them titled the navigation group "Next panel" and then listed "Next
 * panel" inside it.
 */
const GROUPS: readonly { title: CommandLabelKey; ids: readonly CommandId[] }[] = [
  { title: "tui.help.group.run", ids: ["generate", "cancel", "reset", "paste"] },
  {
    title: "tui.help.group.settings",
    ids: ["open-profile", "open-level", "open-model", "open-palette"],
  },
  { title: "tui.help.group.result", ids: ["copy", "toggle-diff", "show-explain"] },
  {
    title: "tui.help.group.navigate",
    ids: ["focus-next", "focus-previous", "open-help", "close-overlay"],
  },
];

/**
 * The help overlay.
 *
 * Derived entirely from the `COMMANDS` registry — a shortcut cannot be shown
 * here unless it exists there, so help and behaviour cannot drift. Grouping is
 * presentational only; the labels and keys come from the registry.
 */
export function HelpOverlay({
  open,
  terminalWidth,
  terminalHeight,
  t,
}: Readonly<HelpOverlayProps>): React.ReactNode {
  const { color } = theme.tokens;

  // A title row plus its commands per group, and one blank row between groups.
  // Commands sit on consecutive rows: a blank line between every shortcut made
  // the list twice as tall as the terminal and pushed it off the bottom.
  const contentRows =
    GROUPS.reduce(
      (rows, group) => rows + 1 + COMMANDS.filter((c) => group.ids.includes(c.id)).length,
      0,
    ) +
    (GROUPS.length - 1);

  return (
    <Dialog
      title={t("tui.help")}
      open={open}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      contentRows={contentRows}
    >
      <Stack direction="column" gap="sm">
        {GROUPS.map((group) => (
          <Stack key={group.title} direction="column" gap="none">
            <text fg={color.textMuted}>{t(group.title)}</text>
            {COMMANDS.filter((command) => group.ids.includes(command.id)).map((command) => (
              <Stack key={command.id} direction="row" gap="sm" justify="space-between">
                <text fg={color.text}>{t(command.labelKey)}</text>
                <text fg={color.accent}>{commandKeyLabel(command) || "—"}</text>
              </Stack>
            ))}
          </Stack>
        ))}
      </Stack>
    </Dialog>
  );
}
