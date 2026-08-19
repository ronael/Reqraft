/* @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { Dialog } from "@/apps/cli/tui/primitives/Dialog.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import type { SelectOption } from "@/apps/cli/ui/modal-options.js";
import type { Translator } from "@/i18n/translate.js";

export interface SelectPickerProps {
  title: string;
  open: boolean;
  options: SelectOption<string>[];
  currentValue: string;
  highlighted: number;
  terminalWidth: number;
  t: Translator;
  /** Same command a click would raise, so mouse and keyboard converge. */
  onSelect?(value: string): void;
}

/**
 * The shared picker overlay.
 *
 * One pattern for profile, level, provider and model: a titled dialog, a list,
 * the current value marked, the highlighted row shown, arrow keys + Enter to
 * choose and Esc to leave. The variation between the four is only the options,
 * which arrive from `ui/modal-options` — not from a copy of the data here.
 */
export function SelectPicker({
  title,
  open,
  options,
  currentValue,
  highlighted,
  terminalWidth,
  t,
  onSelect,
}: Readonly<SelectPickerProps>): React.ReactNode {
  const { color } = theme.tokens;
  const safeIndex = Math.min(highlighted, Math.max(0, options.length - 1));

  return (
    <Dialog title={title} open={open} terminalWidth={terminalWidth}>
      <Stack direction="column" gap="xs">
        {options.map((option, index) => {
          const isCurrent = option.value === currentValue;
          const isHighlighted = index === safeIndex;
          return (
            <text
              key={option.value}
              attributes={isHighlighted ? TextAttributes.BOLD : undefined}
              onMouseDown={
                onSelect === undefined
                  ? undefined
                  : () => {
                      onSelect(option.value);
                    }
              }
            >
              <span fg={isHighlighted ? color.accent : color.textMuted}>
                {isHighlighted ? "›" : " "}
              </span>
              <span fg={isCurrent ? color.success : color.textSubtle}>{isCurrent ? "●" : "○"}</span>
              <span fg={isHighlighted ? color.accent : color.text}>{` ${option.label}`}</span>
              {isCurrent && <span fg={color.textMuted}>{`  ${t("tui.picker.current")}`}</span>}
            </text>
          );
        })}
      </Stack>
    </Dialog>
  );
}
