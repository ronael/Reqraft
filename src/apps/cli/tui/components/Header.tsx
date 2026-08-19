/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { COMMANDS_BY_ID, commandKeyLabel, type CommandId } from "@/apps/cli/tui/model/commands.js";
import type { ToolbarValues } from "@/apps/cli/tui/components/Toolbar.js";
import type { Translator } from "@/i18n/translate.js";

export interface HeaderProps {
  values: ToolbarValues;
  ready: boolean;
  t: Translator;
  /** Compact drops the per-setting shortcuts, not the values. */
  compact?: boolean;
  /** A click on a setting raises the same command the keyboard would. */
  onActivate?(id: CommandId): void;
}

const ENTRIES = [
  { id: "open-profile", key: "profile", labelKey: "tui.field.profile" },
  { id: "open-level", key: "level", labelKey: "tui.field.level" },
  { id: "open-provider", key: "provider", labelKey: "tui.field.provider" },
  { id: "open-model", key: "model", labelKey: "tui.field.model" },
] as const satisfies readonly {
  id: CommandId;
  key: keyof ToolbarValues;
  labelKey: Parameters<Translator>[0];
}[];

/**
 * The header: the Reqraft mark, the current context, and the readiness dot.
 *
 * A single row so the vertical transcript below it keeps every setting visible
 * at a glance. The chord text comes from the command registry — a rebinding
 * moves the displayed key with it — and a click converges on the same CommandId
 * as the keyboard.
 */
export function Header({
  values,
  ready,
  t,
  compact = false,
  onActivate,
}: Readonly<HeaderProps>): React.ReactNode {
  const { color } = theme.tokens;

  return (
    <box
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.tokens.spacing.sm,
      }}
    >
      <Stack direction="row" gap="sm">
        <text attributes={TextAttributes.BOLD} fg={color.accent}>
          {"rq"}
        </text>
        <text fg={color.textMuted}>{"/"}</text>
        {ENTRIES.map(({ id, key, labelKey }) => {
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
              <span fg={color.textMuted}>{`${t(labelKey)} `}</span>
              <span fg={color.text}>{values[key]}</span>
            </text>
          );
        })}
      </Stack>

      <text fg={color.textMuted}>
        <span fg={ready ? color.success : color.warning}>{"●"}</span>
        <span> </span>
        <span>{ready ? t("tui.header.ready") : t("tui.header.preparing")}</span>
      </text>
    </box>
  );
}
