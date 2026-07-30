import React from "react";
import { Box, Text } from "ink";
import { TextInput } from "./text-input.js";
import { theme } from "../theme/tokens.js";

/**
 * Multiline prompt field.
 *
 * The underlying single-line input edits the last line only; committed lines are
 * rendered above it. The full value, newlines included, is owned by the caller —
 * this component never rewrites it beyond the line being typed.
 */
export function PromptField({
  value,
  onChange,
  onSubmit,
  focus,
  placeholder,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  focus: boolean;
  placeholder: string;
}>): React.JSX.Element {
  const lines = value.split("\n");
  const committed = lines.slice(0, -1);
  const current = lines.at(-1) ?? "";

  const handleChange = (next: string): void => {
    onChange([...committed, next].join("\n"));
  };

  return (
    <Box flexDirection="column">
      {committed.map((line, index) => (
        // Lines are positional: the index is their identity.
        <Text key={index} wrap="wrap">
          {line === "" ? " " : line}
        </Text>
      ))}
      <TextInput
        value={current}
        onChange={handleChange}
        onSubmit={onSubmit}
        focus={focus}
        placeholder={value === "" ? placeholder : ""}
      />
    </Box>
  );
}

/** Hint shown under the field, so the continuation rule is discoverable. */
export function PromptFieldHint(): React.JSX.Element {
  return (
    <Text dimColor>
      {theme.symbol.arrow} Entrée génère · {"\\"} puis Entrée pour une nouvelle ligne
    </Text>
  );
}
