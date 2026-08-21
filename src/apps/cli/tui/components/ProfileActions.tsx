/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Dialog } from "@/apps/cli/tui/primitives/Dialog.js";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import type { Translator } from "@/i18n/translate.js";

/**
 * What can be done to the profile highlighted in the picker.
 *
 * A list rather than a handful of new chords: the four actions reuse the
 * arrow-keys-and-Enter interaction every other overlay already has, so nothing
 * new has to be learned and no global shortcut is shadowed.
 *
 * Built-in profiles keep their rows instead of losing them. An action that
 * silently disappears reads as a bug; one shown as unavailable, with the reason
 * beside it, answers the question the user actually has — "why can I not edit
 * this one?".
 */

export type ProfileActionId = "edit" | "duplicate" | "export" | "delete" | "create";

export interface ProfileActionEntry {
  id: ProfileActionId;
  label: string;
  /** Absent when the action can run; set to the reason when it cannot. */
  unavailable?: string;
}

/**
 * The action list for a profile of the given origin.
 *
 * Only `duplicate` and `export` work on a built-in: both produce something new
 * rather than touching what ships with the binary. `create` is always there —
 * it needs no profile at all.
 */
export function profileActions(isLocal: boolean, t: Translator): ProfileActionEntry[] {
  const locked = isLocal ? undefined : t("tui.profileActions.builtinLocked");
  return [
    { id: "edit", label: t("tui.profileActions.edit"), unavailable: locked },
    { id: "duplicate", label: t("tui.profileActions.duplicate") },
    { id: "export", label: t("tui.profileActions.export") },
    { id: "delete", label: t("tui.profileActions.delete"), unavailable: locked },
    { id: "create", label: t("tui.profileActions.create") },
  ];
}

export interface ProfileActionsProps {
  open: boolean;
  profileId: string;
  isLocal: boolean;
  highlighted: number;
  /** Id awaiting confirmation, which replaces the list with the question. */
  pendingDelete?: string | null;
  terminalWidth: number;
  terminalHeight: number;
  t: Translator;
  onSelect?(action: ProfileActionId): void;
}

export function ProfileActions({
  open,
  profileId,
  isLocal,
  highlighted,
  pendingDelete = null,
  terminalWidth,
  terminalHeight,
  t,
  onSelect,
}: Readonly<ProfileActionsProps>): React.ReactNode {
  const { color } = theme.tokens;
  const entries = profileActions(isLocal, t);
  const safeIndex = Math.min(highlighted, Math.max(0, entries.length - 1));

  // A deletion replaces the list rather than overlaying a second dialog: one
  // question at a time, and the only two keys that matter are named in it.
  if (pendingDelete !== null) {
    return (
      <Dialog
        title={t("tui.profileActions.title", { id: profileId })}
        open={open}
        terminalWidth={terminalWidth}
        terminalHeight={terminalHeight}
        contentRows={1}
      >
        <text fg={color.warning}>{t("tui.profile.deleteConfirm", { id: pendingDelete })}</text>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={t("tui.profileActions.title", { id: profileId })}
      open={open}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      contentRows={entries.length}
    >
      <Stack direction="column" gap="none">
        {entries.map((entry, index) => {
          const isHighlighted = index === safeIndex;
          const disabled = entry.unavailable !== undefined;
          // An unavailable row reads as dim before it reads as highlighted: the
          // cursor may sit on it, but it still cannot be chosen.
          const emphasis = isHighlighted ? TextAttributes.BOLD : undefined;
          const attributes = disabled ? TextAttributes.DIM : emphasis;
          const labelColor = isHighlighted && !disabled ? color.accent : color.text;
          return (
            <text
              key={entry.id}
              attributes={attributes}
              onMouseDown={
                disabled || onSelect === undefined
                  ? undefined
                  : () => {
                      onSelect(entry.id);
                    }
              }
            >
              <span fg={isHighlighted ? color.accent : color.textMuted}>
                {isHighlighted ? "›" : " "}
              </span>
              <span fg={disabled ? color.textMuted : labelColor}>{` ${entry.label}`}</span>
              {disabled && <span fg={color.textMuted}>{`  — ${entry.unavailable ?? ""}`}</span>}
            </text>
          );
        })}
      </Stack>
    </Dialog>
  );
}
