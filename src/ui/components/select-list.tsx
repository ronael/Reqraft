import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme/tokens.js";
import { computeWindow, filterItems, moveIndex, type SelectItem } from "../select-list.js";

const VISIBLE_ROWS = 8;
/** Searching a short list costs more than it saves. */
const SEARCH_FROM = 8;

/**
 * The one selection surface, shared by every picker (DA.md section 9).
 *
 * Arrows navigate, Enter validates, Escape cancels. Long lists gain a local
 * search and scroll, and the entry currently in use is marked so the user can
 * see what they are about to change.
 */
export function SelectList<T extends string>({
  items,
  currentValue,
  onSelect,
  onCancel,
  isActive = true,
}: Readonly<{
  items: SelectItem<T>[];
  currentValue?: T;
  onSelect: (value: T) => void;
  onCancel: () => void;
  isActive?: boolean;
}>): React.JSX.Element {
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);

  const searchable = items.length >= SEARCH_FROM;
  const filtered = searchable ? filterItems(items, query) : items;
  const safeHighlighted = Math.min(highlighted, Math.max(0, filtered.length - 1));
  const window = computeWindow(filtered, safeHighlighted, VISIBLE_ROWS);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow || key.downArrow) {
      setHighlighted(moveIndex(safeHighlighted, key.upArrow ? -1 : 1, filtered.length));
      return;
    }
    if (key.return) {
      const chosen = filtered[safeHighlighted];
      if (chosen) {
        onSelect(chosen.value);
      }
      return;
    }
    if (!searchable) {
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((value) => value.slice(0, -1));
      setHighlighted(0);
      return;
    }
    // Control combinations stay reserved for the application.
    if (input && !key.ctrl && !key.meta) {
      setQuery((value) => value + input);
      setHighlighted(0);
    }
  }, { isActive });

  return (
    <Box flexDirection="column">
      {searchable && (
        <Text dimColor>
          Recherche : {query === "" ? "…" : query} ({String(filtered.length)}/{String(items.length)}
          )
        </Text>
      )}
      {window.hasMoreAbove && <Text dimColor> ↑ …</Text>}
      {filtered.length === 0 && <Text dimColor>Aucun résultat pour « {query} ».</Text>}
      {window.visible.map((item, index) => (
        <SelectRow
          key={item.value}
          item={item}
          selected={index === window.highlightedOffset}
          current={item.value === currentValue}
        />
      ))}
      {window.hasMoreBelow && <Text dimColor> ↓ …</Text>}
      <Box marginTop={theme.spacing.sm}>
        <Text dimColor>
          ↑↓ naviguer · Entrée choisir · Esc revenir
          {searchable ? " · tape pour filtrer" : ""}
        </Text>
      </Box>
    </Box>
  );
}

function SelectRow<T extends string>({
  item,
  selected,
  current,
}: Readonly<{
  item: SelectItem<T>;
  selected: boolean;
  current: boolean;
}>): React.JSX.Element {
  return (
    <Box>
      <Text color={selected ? theme.color.accent : undefined}>{selected ? "› " : "  "}</Text>
      <Text dimColor={!current}>{current ? theme.symbol.active : theme.symbol.inactive} </Text>
      <Text bold={selected} dimColor={!selected && !current}>
        {item.label}
      </Text>
      {item.description !== undefined && <Text dimColor> — {item.description}</Text>}
    </Box>
  );
}
