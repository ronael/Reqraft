/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Dialog } from "@/apps/cli/tui/primitives/Dialog.js";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { TextEditor } from "@/apps/cli/tui/primitives/TextEditor.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import {
  PROFILE_FORM_FIELDS,
  currentField,
  isIdEditable,
  type ProfileFormFieldId,
  type ProfileFormState,
} from "@/apps/cli/ui/profile-form.js";
import type { Translator } from "@/i18n/translate.js";

/**
 * The local-profile form.
 *
 * Renders a form state it does not own: field order, the choice cycling and
 * every validation rule live in `ui/profile-form`, which is testable without a
 * terminal. This file decides only what a focused row looks like.
 *
 * The instructions field is the project's own `TextEditor` — OpenTUI's textarea
 * — rather than a hand-rolled multiline input. It already owns the cursor,
 * word motions, paste and unicode; reimplementing that produces an editor that
 * looks right until someone types an accent.
 */

const FIELD_LABEL_KEYS = {
  name: "tui.profileForm.field.name",
  id: "tui.profileForm.field.id",
  description: "tui.profileForm.field.description",
  extends: "tui.profileForm.field.extends",
  defaultLevel: "tui.profileForm.field.defaultLevel",
  instructions: "tui.profileForm.field.instructions",
} as const;

const PROBLEM_KEYS = {
  required: "tui.profileForm.required",
  idInvalid: "tui.profileForm.idInvalid",
  levelInvalid: "tui.profileForm.levelInvalid",
} as const;

/** Message shown under the form, resolved from the pure model's problem key. */
export function profileFormMessage(state: ProfileFormState, t: Translator): string | undefined {
  if (state.saving) return t("tui.profileForm.saving");
  return state.error;
}

export interface ProfileFormProps {
  open: boolean;
  state: ProfileFormState;
  terminalWidth: number;
  terminalHeight: number;
  t: Translator;
  onInstructionsChange(value: string): void;
}

function titleFor(state: ProfileFormState, t: Translator): string {
  if (state.mode === "edit") {
    return t("tui.profileForm.titleEdit", { id: state.sourceId ?? state.values.id });
  }
  if (state.mode === "duplicate") {
    return t("tui.profileForm.titleDuplicate", { id: state.sourceId ?? "" });
  }
  return t("tui.profileForm.titleCreate");
}

export function ProfileForm({
  open,
  state,
  terminalWidth,
  terminalHeight,
  t,
  onInstructionsChange,
}: Readonly<ProfileFormProps>): React.ReactNode {
  const { color, spacing } = theme.tokens;
  const focused = currentField(state);
  const message = profileFormMessage(state, t);

  // Three rows of chrome under the fields: the hint line, the message line and
  // the breathing space between them.
  const instructionRows = 4;
  const contentRows = PROFILE_FORM_FIELDS.length + instructionRows + 3;

  const renderValue = (id: ProfileFormFieldId): React.ReactNode => {
    const value = state.values[id];
    const isFocused = focused.id === id;
    const locked = id === "id" && !isIdEditable(state);

    if (id === "instructions") {
      // The textarea owns its keys while focused, which is what makes the
      // multiline field work without the overlay router growing a newline case.
      return (
        <TextEditor
          id="profile-form-instructions"
          value={value}
          focused={isFocused && !state.saving}
          height={instructionRows}
          onChange={onInstructionsChange}
        />
      );
    }

    // The caret only appears where typing actually lands: a choice field is
    // changed with the arrows, and a locked id takes no input at all. Showing
    // one there would promise an insertion point that does not exist.
    const field = PROFILE_FORM_FIELDS.find((candidate) => candidate.id === id);
    const showsCursor = isFocused && !state.saving && field?.kind === "text" && !locked;

    if (showsCursor) {
      return (
        <text>
          <span fg={color.text}>{value}</span>
          <span fg={color.accent}>{theme.tokens.glyph.cursor}</span>
        </text>
      );
    }

    const shown = value === "" ? t("tui.profileForm.empty") : value;
    return (
      <text>
        <span fg={isFocused ? color.accent : color.text}>{shown}</span>
        {locked && <span fg={color.textMuted}>{`  ${t("tui.profileForm.idLocked")}`}</span>}
      </text>
    );
  };

  return (
    <Dialog
      title={titleFor(state, t)}
      open={open}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      contentRows={contentRows}
    >
      <Stack direction="column" gap="none">
        {PROFILE_FORM_FIELDS.map((field) => {
          const isFocused = focused.id === field.id;
          return (
            <box key={field.id} style={{ flexDirection: "column" }}>
              <text attributes={isFocused ? TextAttributes.BOLD : undefined}>
                <span fg={isFocused ? color.accent : color.textMuted}>
                  {isFocused ? "› " : "  "}
                </span>
                <span fg={isFocused ? color.accent : color.textMuted}>
                  {t(FIELD_LABEL_KEYS[field.id])}
                </span>
              </text>
              <box style={{ paddingLeft: spacing.sm }}>{renderValue(field.id)}</box>
            </box>
          );
        })}

        <box style={{ marginTop: spacing.xs, flexDirection: "column" }}>
          {message !== undefined && (
            <text fg={state.saving ? color.textMuted : color.error}>{message}</text>
          )}
          <text fg={color.textMuted}>
            {focused.kind === "choice"
              ? `${t("tui.profileForm.hintChoice")}  ${t("tui.profileForm.hintSave")}`
              : `${t("tui.profileForm.hintNav")}  ${t("tui.profileForm.hintSave")}`}
          </text>
        </box>
      </Stack>
    </Dialog>
  );
}

/** Resolves a model problem key into the message shown to the user. */
export function profileFormProblemMessage(
  key: "required" | "idInvalid" | "levelInvalid",
  t: Translator,
): string {
  return t(PROBLEM_KEYS[key]);
}
