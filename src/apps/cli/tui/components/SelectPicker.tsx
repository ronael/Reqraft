/* @jsxImportSource @opentui/react */
import React, { useRef } from "react";
import { TextAttributes } from "@opentui/core";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { Dialog, dialogBodyCapacity } from "@/apps/cli/tui/primitives/Dialog.js";
import { visibleWindow } from "@/apps/cli/tui/model/overlay.js";
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
  /** Ce qui a été tapé pour filtrer. La liste arrive déjà filtrée. */
  query?: string;
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
  query,
  t,
  onSelect,
}: Readonly<SelectPickerProps>): React.ReactNode {
  const { color } = theme.tokens;
  const previousStart = useRef(0);
  const safeIndex = Math.min(highlighted, Math.max(0, options.length - 1));

  // Headers are derived here rather than stored in `options`, so the arrow-key
  // index space stays the list of selectable rows: adding a group cannot make
  // Enter land on a title. They still cost a row, hence the taller `contentRows`.
  const sections = new Set(options.map((option) => option.section).filter(Boolean));
  const hasNoMatches = !options.some((option) => option.kind !== "action");

  // Ce que la liste peut montrer sans repasser sous le défilement du dialogue,
  // qui lui n'a aucune idée de la ligne surlignée : la recherche, le compteur,
  // le pied, et une ligne réservée par groupe.
  const searchRows = query === undefined ? 0 : 1;
  const hintRows = hint === undefined ? 0 : 2;
  const noMatchRows = hasNoMatches ? 1 : 0;
  const capacity = Math.max(
    1,
    dialogBodyCapacity(terminalHeight) - searchRows - hintRows - noMatchRows - sections.size - 1,
  );
  // La tranche précédente est gardée : recalculée depuis zéro, elle épinglait
  // le surlignage au bas du cadre et faisait défiler la liste à CHAQUE flèche
  // vers le haut. Elle ne doit glisser que lorsque la ligne visée en sort.
  const window = visibleWindow(safeIndex, options.length, capacity, previousStart.current);
  previousStart.current = window.start;
  const shown = options.slice(window.start, window.end);
  const truncated = shown.length < options.length;
  const shownSections = new Set(shown.map((option) => option.section).filter(Boolean));
  const contentRows =
    shown.length + shownSections.size + searchRows + hintRows + noMatchRows + (truncated ? 1 : 0);

  return (
    <Dialog
      title={title}
      open={open}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      contentRows={contentRows}
    >
      <Stack direction="column" gap="none">
        {query !== undefined && (
          <text fg={color.textMuted}>
            {query === "" ? t("tui.picker.searchHint") : `${t("tui.picker.search")} ${query}`}
          </text>
        )}
        {hasNoMatches && (
          // Aucune valeur, mais pas forcément une liste vide : la ligne
          // d'action reste offerte, et sans un mot la recherche infructueuse
          // ressemblerait à un catalogue qui ne contient que « créer ».
          <text fg={color.textMuted}>{t("tui.picker.noMatch")}</text>
        )}
        {shown.map((option, offset) => {
          const index = window.start + offset;
          const startsSection =
            option.section !== undefined &&
            (offset === 0 || option.section !== shown[offset - 1]?.section);
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

        {truncated && (
          <text fg={color.textMuted}>
            {t("tui.picker.range", {
              from: String(window.start + 1),
              to: String(window.end),
              total: String(options.length),
            })}
          </text>
        )}

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
