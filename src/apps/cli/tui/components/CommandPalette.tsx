/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { Dialog } from "@/apps/cli/tui/primitives/Dialog.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import {
  availableCommands,
  commandKeyLabel,
  type CommandContext,
  type CommandId,
} from "@/apps/cli/tui/model/commands.js";
import type { Translator } from "@/i18n/translate.js";

export interface CommandPaletteProps {
  open: boolean;
  context: CommandContext;
  query: string;
  highlighted: number;
  terminalWidth: number;
  t: Translator;
  onSelect?(id: CommandId): void;
}

/**
 * The command palette, Ctrl+K.
 *
 * Lists the commands that are actually available right now, read from the same
 * `COMMANDS` registry the keyboard router and help overlay use — there is no
 * second hardcoded list to drift. Filtering is a case-insensitive substring
 * match on the command label. "No result" is an ordinary state, not a bug.
 */
export function CommandPalette({
  open,
  context,
  query,
  highlighted,
  terminalWidth,
  t,
  onSelect,
}: Readonly<CommandPaletteProps>): React.ReactNode {
  const { color } = theme.tokens;
  const needle = query.trim().toLowerCase();
  const commands = availableCommands(context).filter(
    (command) => needle === "" || t(command.labelKey).toLowerCase().includes(needle),
  );
  const safeIndex = Math.min(highlighted, Math.max(0, commands.length - 1));

  return (
    <Dialog title={t("tui.palette.title")} open={open} terminalWidth={terminalWidth}>
      <Stack direction="column" gap="xs">
        <text fg={color.accent}>
          {"> "}
          <span fg={color.text}>{query}</span>
        </text>

        {commands.length === 0 ? (
          <text fg={color.textMuted}>{t("tui.palette.noResult")}</text>
        ) : (
          <text fg={color.textMuted}>{t("tui.palette.available")}</text>
        )}

        {commands.map((command, index) => {
          const isHighlighted = index === safeIndex;
          return (
            <text
              key={command.id}
              attributes={isHighlighted ? TextAttributes.BOLD : undefined}
              onMouseDown={
                onSelect === undefined
                  ? undefined
                  : () => {
                      onSelect(command.id);
                    }
              }
            >
              <span fg={isHighlighted ? color.accent : color.textMuted}>
                {isHighlighted ? "›" : " "}
              </span>
              <span fg={isHighlighted ? color.accent : color.text}>{t(command.labelKey)}</span>
              {commandKeyLabel(command) !== "" && (
                <span fg={color.textMuted}>{`  ${commandKeyLabel(command)}`}</span>
              )}
            </text>
          );
        })}
      </Stack>
    </Dialog>
  );
}
