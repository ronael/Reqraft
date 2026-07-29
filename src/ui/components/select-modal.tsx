import React from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { theme } from "../theme/tokens.js";

export interface SelectOption<T> {
  label: string;
  value: T;
}

interface SelectModalProps<T> {
  title: string;
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  onCancel: () => void;
}

export function SelectModal<T extends string>({
  title,
  options,
  onSelect,
  onCancel,
}: Readonly<SelectModalProps<T>>): React.JSX.Element {
  const items = options.map((option) => ({ label: option.label, value: option.value }));

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={theme.color.accent}>
        {title}
      </Text>
      <SelectInput
        items={items}
        indicatorComponent={({ isSelected }) => (
          <Text color={theme.color.accent}>{isSelected ? "> " : "  "}</Text>
        )}
        itemComponent={({ isSelected, label }) => (
          <Text color={isSelected ? theme.color.text : theme.color.muted} bold={isSelected}>
            {label}
          </Text>
        )}
        onSelect={(item) => {
          onSelect(item.value);
        }}
        onHighlight={() => undefined}
      />
      <Text dimColor>↑↓ naviguer Entrée choisir Esc revenir</Text>
    </Box>
  );
}
