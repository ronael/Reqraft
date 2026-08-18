/* @jsxImportSource @opentui/react */
import React from "react";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { COMMANDS_BY_ID, commandKeyLabel, type CommandId } from "@/apps/cli/tui/model/commands.js";

export interface ToolbarValues {
  profile: string;
  level: string;
  provider: string;
  model: string;
}

export interface ToolbarProps {
  values: ToolbarValues;
  /** Compact drops the shortcut hints and keeps only the values. */
  compact?: boolean;
  /** Same command a click would raise, so mouse and keyboard converge. */
  onActivate?(id: CommandId): void;
}

const ENTRIES: readonly { id: CommandId; key: keyof ToolbarValues }[] = [
  { id: "open-profile", key: "profile" },
  { id: "open-level", key: "level" },
  { id: "open-provider", key: "provider" },
  { id: "open-model", key: "model" },
];

/**
 * Current settings, each labelled with the shortcut that changes it.
 *
 * The chord text comes from the registry rather than a literal: a rebinding
 * moves the displayed key with it. `open-provider` has no chord today, so its
 * entry simply renders without one instead of inventing a shortcut.
 */
export function Toolbar({
  values,
  compact = false,
  onActivate,
}: Readonly<ToolbarProps>): React.ReactNode {
  const { color } = theme.tokens;

  return (
    <Stack direction="row" gap="sm">
      {ENTRIES.map(({ id, key }) => {
        const command = COMMANDS_BY_ID.get(id);
        const chord = command ? commandKeyLabel(command) : "";
        return (
          <text
            key={id}
            onMouseDown={
              onActivate === undefined
                ? undefined
                : () => {
                    onActivate(id);
                  }
            }
          >
            {!compact && chord !== "" && <span fg={color.accent}>{`${chord} `}</span>}
            <span fg={color.textMuted}>{`${key}:`}</span>
            <span fg={color.text}>{values[key]}</span>
          </text>
        );
      })}
    </Stack>
  );
}
