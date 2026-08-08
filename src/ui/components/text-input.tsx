import React, { useEffect, useState } from "react";
import { Text, useInput } from "ink";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  focus?: boolean;
  placeholder?: string;
}

interface InputKey {
  upArrow?: boolean;
  downArrow?: boolean;
  tab?: boolean;
  return?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

/**
 * Single-line text input that coordinates with the application-level shortcut
 * handler instead of fighting it.
 *
 * - `focus` controls `useInput` activation via `isActive`, so the editor is
 *   never active while an overlay has focus.
 * - Control and meta combinations are explicitly ignored, so `Ctrl+P`, `Ctrl+L`,
 *   etc. do not leak into the edited value.
 * - Cursor movement, backspace and ordinary characters keep working.
 */
export function TextInput({
  value,
  onChange,
  onSubmit,
  focus = true,
  placeholder = "",
}: Readonly<TextInputProps>): React.JSX.Element {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  useEffect(() => {
    setCursorOffset((previous) => Math.min(previous, value.length));
  }, [value.length]);

  useInput(
    (input, key) => {
      // Reserved combinations are handled by the application's shortcut layer.
      if (isReservedForApplication(input, key)) {
        return;
      }

      if (key.return) {
        onSubmit?.();
        return;
      }

      let nextValue = value;
      let nextCursor: number;

      if (key.leftArrow) {
        nextCursor = Math.max(0, cursorOffset - 1);
      } else if (key.rightArrow) {
        nextCursor = Math.min(value.length, cursorOffset + 1);
      } else if (canDeleteBackward(key, cursorOffset)) {
        nextValue = value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
        nextCursor = cursorOffset - 1;
      } else if (input && !key.ctrl && !key.meta) {
        // Pasting multi-character text arrives as a single `input` event.
        nextValue = value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
        nextCursor = cursorOffset + input.length;
      } else {
        return;
      }

      nextCursor = Math.max(0, Math.min(nextValue.length, nextCursor));

      if (nextValue !== value) {
        onChange(nextValue);
      }
      if (nextCursor !== cursorOffset) {
        setCursorOffset(nextCursor);
      }
    },
    { isActive: focus },
  );

  return <Text>{renderContent({ value, placeholder, focus, cursorOffset })}</Text>;
}

function isReservedForApplication(input: string, key: InputKey): boolean {
  return isNavigationReserved(key) || isInterruptReserved(input, key);
}

function isNavigationReserved(key: InputKey): boolean {
  return key.upArrow === true || key.downArrow === true || key.tab === true;
}

function isInterruptReserved(input: string, key: InputKey): boolean {
  return key.ctrl === true && input === "c";
}

function canDeleteBackward(key: InputKey, cursorOffset: number): boolean {
  return (key.backspace === true || key.delete === true) && cursorOffset > 0;
}

function renderContent({
  value,
  placeholder,
  focus,
  cursorOffset,
}: Readonly<{
  value: string;
  placeholder: string;
  focus: boolean;
  cursorOffset: number;
}>): React.ReactNode[] {
  if (!focus) {
    return renderInactiveContent(value, placeholder);
  }

  if (value.length === 0) {
    return renderFocusedEmptyContent(placeholder);
  }

  return renderValueWithCursor(value, cursorOffset);
}

function renderInactiveContent(value: string, placeholder: string): React.ReactNode[] {
  if (value.length > 0) {
    return [value];
  }
  return [placeholder.length > 0 ? placeholder : " "];
}

function renderFocusedEmptyContent(placeholder: string): React.ReactNode[] {
  if (placeholder.length === 0) {
    return [
      <Text inverse key="cursor-empty">
        {" "}
      </Text>,
    ];
  }
  return [
    <React.Fragment key="placeholder">
      <Text inverse>{placeholder[0]}</Text>
      <Text dimColor>{placeholder.slice(1)}</Text>
    </React.Fragment>,
  ];
}

function renderValueWithCursor(value: string, cursorOffset: number): React.ReactNode[] {
  const chars = Array.from(value);
  const nodes: React.ReactNode[] = [];
  let index = 0;
  for (const char of chars) {
    if (index === cursorOffset) {
      nodes.push(
        <Text inverse key={`cursor-${String(index)}`}>
          {char}
        </Text>,
      );
    } else {
      nodes.push(<Text key={`char-${String(index)}`}>{char}</Text>);
    }
    index += 1;
  }

  if (cursorOffset >= chars.length) {
    nodes.push(
      <Text inverse key="cursor-trail">
        {" "}
      </Text>,
    );
  }

  return nodes;
}
