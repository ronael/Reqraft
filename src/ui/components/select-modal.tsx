import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";
import type { SelectItem } from "../select-list.js";
import { SelectList } from "./select-list.js";

/** Kept as the shared option shape used by modal-options.ts. */
export type SelectOption<T> = SelectItem<T>;

interface SelectModalProps<T> {
  title: string;
  options: SelectOption<T>[];
  currentValue?: T;
  onSelect: (value: T) => void;
  onCancel: () => void;
}

export function SelectModal<T extends string>({
  title,
  options,
  currentValue,
  onSelect,
  onCancel,
}: Readonly<SelectModalProps<T>>): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={theme.color.accent}>
        {title}
      </Text>
      <SelectList
        items={options}
        currentValue={currentValue}
        onSelect={onSelect}
        onCancel={onCancel}
      />
    </Box>
  );
}
