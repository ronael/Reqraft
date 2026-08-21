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
  terminalHeight: number;
  /**
   * Footer line for actions the list itself cannot show. Without it the profile
   * picker offered no way to discover that it manages profiles at all.
   */
  hint?: string;
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
  terminalHeight,
  hint,
  t,
  onSelect,
}: Readonly<SelectPickerProps>): React.ReactNode {
  const { color } = theme.tokens;
  const safeIndex = Math.min(highlighted, Math.max(0, options.length - 1));

  // Headers are derived here rather than stored in `options`, so the arrow-key
  // index space stays the list of selectable rows: adding a group cannot make
  // Enter land on a title. They still cost a row, hence the taller `contentRows`.
  const sections = new Set(options.map((option) => option.section).filter(Boolean));
  const contentRows = options.length + sections.size + (hint === undefined ? 0 : 2);

  return (
    <Dialog
      title={title}
      open={open}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      contentRows={contentRows}
    >
      <Stack direction="column" gap="none">
        {options.map((option, index) => {
          const startsSection =
            option.section !== undefined && option.section !== options[index - 1]?.section;
          const row = (
            <PickerRow
              key={option.value}
              option={option}
              currentValue={currentValue}
              highlighted={index === safeIndex}
              t={t}
              onSelect={onSelect}
            />
          );

          if (!startsSection) return row;
          return (
            <box key={`${option.value}-section`} style={{ flexDirection: "column" }}>
              <text attributes={TextAttributes.BOLD} fg={color.textMuted}>
                {option.section}
              </text>
              {row}
            </box>
          );
        })}

        {hint !== undefined && (
          <box style={{ marginTop: theme.tokens.spacing.xs }}>
            <text fg={color.textMuted}>{hint}</text>
          </box>
        )}
      </Stack>
    </Dialog>
  );
}

/**
 * What a row's marker column says: an action does something, the current value
 * is the one in force, everything else is a choice. Split out so the marker and
 * its colour are decided once, together.
 */
function markerFor(
  option: SelectOption<string>,
  currentValue: string,
): { glyph: string; tone: "action" | "current" | "choice" } {
  if (option.kind === "action") return { glyph: "+", tone: "action" };
  if (option.value === currentValue) return { glyph: "●", tone: "current" };
  return { glyph: "○", tone: "choice" };
}

function PickerRow({
  option,
  currentValue,
  highlighted,
  t,
  onSelect,
}: Readonly<{
  option: SelectOption<string>;
  currentValue: string;
  highlighted: boolean;
  t: Translator;
  onSelect?(value: string): void;
}>): React.ReactNode {
  const { color } = theme.tokens;
  const marker = markerFor(option, currentValue);
  const markerColor = {
    action: color.accent,
    current: color.success,
    choice: color.textSubtle,
  }[marker.tone];

  return (
    <text
      attributes={highlighted ? TextAttributes.BOLD : undefined}
      onMouseDown={
        onSelect === undefined
          ? undefined
          : () => {
              onSelect(option.value);
            }
      }
    >
      <span fg={highlighted ? color.accent : color.textMuted}>{highlighted ? "›" : " "}</span>
      <span fg={markerColor}>{marker.glyph}</span>
      <span fg={highlighted ? color.accent : color.text}>{` ${option.label}`}</span>
      {option.hint !== undefined && <span fg={color.textMuted}>{`  ${option.hint}`}</span>}
      {marker.tone === "current" && (
        <span fg={color.textMuted}>{`  ${t("tui.picker.current")}`}</span>
      )}
    </text>
  );
}
