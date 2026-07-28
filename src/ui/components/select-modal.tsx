import React from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";

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
}: SelectModalProps<T>): React.JSX.Element {
  const items = options.map((option) => ({ label: option.label, value: option.value }));

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" padding={1}>
      <Text bold>{title}</Text>
      <SelectInput
        items={items}
        onSelect={(item) => {
          onSelect(item.value);
        }}
        onHighlight={() => undefined}
      />
      <Text dimColor>Esc pour annuler</Text>
    </Box>
  );
}
