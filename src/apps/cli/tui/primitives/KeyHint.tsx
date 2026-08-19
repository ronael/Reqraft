/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { KeyCap } from "@/apps/cli/tui/primitives/KeyCap.js";
import { commandKeyLabel, type CommandDefinition } from "@/apps/cli/tui/model/commands.js";
import type { Translator } from "@/i18n/translate.js";

export interface KeyHintProps {
  command: CommandDefinition;
  t: Translator;
  /** Advertised but inert in the current state. */
  disabled?: boolean;
  /** A click on the hint raises the command, converging mouse and keyboard. */
  onActivate?(): void;
}

/**
 * One shortcut, rendered from the registry.
 *
 * Both halves come from the same definition, so the footer cannot advertise a
 * key the handler does not implement — the drift this replaces had the label
 * hardcoded in one module and the binding in another.
 */
export function KeyHint({
  command,
  t,
  disabled = false,
  onActivate,
}: Readonly<KeyHintProps>): React.ReactNode {
  const { color } = theme.tokens;
  return (
    <text
      attributes={disabled ? TextAttributes.DIM : undefined}
      onMouseDown={disabled || onActivate === undefined ? undefined : onActivate}
    >
      <KeyCap label={commandKeyLabel(command)} muted={disabled} />
      <span fg={color.textMuted}> </span>
      <span fg={disabled ? color.textMuted : color.textSubtle}>{t(command.labelKey)}</span>
    </text>
  );
}
