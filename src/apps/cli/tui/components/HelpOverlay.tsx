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
  t: Translator;
}

const GROUPS: readonly { title: CommandLabelKey; ids: readonly CommandId[] }[] = [
  { title: "tui.command.palette", ids: ["generate", "cancel", "reset", "paste"] },
  {
    title: "tui.command.profile",
    ids: ["open-profile", "open-level", "open-model", "open-palette"],
  },
  { title: "tui.command.copy", ids: ["copy", "toggle-diff", "show-explain"] },
  {
    title: "tui.command.focusNext",
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
  t,
}: Readonly<HelpOverlayProps>): React.ReactNode {
  const { color } = theme.tokens;

  return (
    <Dialog title={t("tui.help")} open={open} terminalWidth={terminalWidth}>
      <Stack direction="column" gap="sm">
        {GROUPS.map((group) => (
          <Stack key={group.title} direction="column" gap="xs">
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
