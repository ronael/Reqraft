/* @jsxImportSource @opentui/react */
import { TextareaRenderable, type KeyEvent, type PasteEvent } from "@opentui/core";
import { useEffect, useRef } from "react";
import { COLOR } from "../theme/tui.js";

/**
 * The prompt editor.
 *
 * A thin wrapper around OpenTUI's native `textarea` (real EditBuffer:
 * grapheme-aware caret, selection, undo, word motion). The component is
 * uncontrolled — the renderable is the source of truth while the user edits,
 * and the `value` prop only pushes external changes (reset, programmatic
 * set) into the buffer.
 *
 * Enter submits; a trailing backslash turns Enter into a newline (the
 * convention shells and agent CLIs use, since terminals cannot distinguish
 * Enter from Ctrl+Enter).
 */

const LINE_CONTINUATION = "\\";
const ENTER_KEYS = new Set(["return", "kpenter", "linefeed"]);

export interface TextInputHandle {
  focus(): void;
  blur(): void;
  setText(text: string): void;
  /** Inserts at the caret (clipboard fallback for terminals without bracketed paste). */
  insertText(text: string): void;
  readonly value: string;
  readonly focused: boolean;
  readonly renderable: TextareaRenderable | null;
}

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFocusChange?: (focused: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  rows: number;
  width: number;
  autoFocus?: boolean;
  inputRef?: (handle: TextInputHandle) => void;
}

export function TextInput({
  value,
  onChange,
  onSubmit,
  onFocusChange,
  placeholder,
  disabled = false,
  error = false,
  rows,
  width,
  autoFocus = false,
  inputRef,
}: TextInputProps): React.ReactNode {
  const ta = useRef<TextareaRenderable | null>(null);
  const callbacks = useRef({ onChange, onSubmit, onFocusChange });
  callbacks.current = { onChange, onSubmit, onFocusChange };

  useEffect(() => {
    const input = ta.current;
    if (!input) return;
    if (value !== input.plainText) {
      input.setText(value);
      // External changes (initial value, reset) put the caret at the end: the
      // prompt is continued, not re-read.
      input.cursorOffset = input.plainText.length;
    }
  }, [value]);

  useEffect(() => {
    const input = ta.current;
    if (!input) return;
    if (input.plainText.length > 0) input.cursorOffset = input.plainText.length;
    const onFocused = (): void => callbacks.current.onFocusChange?.(true);
    const onBlurred = (): void => callbacks.current.onFocusChange?.(false);
    input.on("focused", onFocused);
    input.on("blurred", onBlurred);
    if (autoFocus) {
      const timer = setTimeout(() => {
        if (!input.isDestroyed) input.focus();
      }, 0);
      return () => {
        clearTimeout(timer);
        input.off("focused", onFocused);
        input.off("blurred", onBlurred);
      };
    }
    return () => {
      input.off("focused", onFocused);
      input.off("blurred", onBlurred);
    };
  }, [autoFocus]);

  const handleKeyDown = (key: KeyEvent): void => {
    const input = ta.current;
    if (!input) return;
    if (disabled) {
      key.preventDefault();
      return;
    }
    if (ENTER_KEYS.has(key.name)) {
      // Trailing backslash: the backslash is an editing mark, never part of
      // the prompt — it becomes the newline.
      if (input.cursorOffset === input.plainText.length && input.plainText.endsWith(LINE_CONTINUATION)) {
        key.preventDefault();
        input.deleteCharBackward();
        input.newLine();
      }
    }
  };

  const handlePaste = (event: PasteEvent): void => {
    const input = ta.current;
    if (!input) return;
    if (disabled) {
      event.preventDefault();
      return;
    }
    // Normalize line endings at the boundary (Windows terminals send CR or
    // CRLF); the native handler already strips ANSI sequences.
    const text = new TextDecoder().decode(event.bytes).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    event.preventDefault();
    input.insertText(text);
  };

  const textColor = disabled ? COLOR.muted : error ? COLOR.error : COLOR.text;

  inputRef?.({
    focus: () => ta.current?.focus(),
    blur: () => ta.current?.blur(),
    setText: (text: string) => ta.current?.setText(text),
    insertText: (text: string) => ta.current?.insertText(text),
    get value() {
      return ta.current?.plainText ?? "";
    },
    get focused() {
      return ta.current?.focused ?? false;
    },
    get renderable() {
      return ta.current;
    },
  });

  return (
    <textarea
      initialValue={value}
      width={width}
      height={rows}
      wrapMode="word"
      placeholder={placeholder}
      placeholderColor={COLOR.muted}
      textColor={textColor}
      focusedTextColor={textColor}
      backgroundColor={COLOR.panel}
      focusedBackgroundColor={COLOR.panelSoft}
      cursorColor={disabled ? COLOR.panel : COLOR.accent}
      cursorStyle={{ style: "block", blinking: true }}
      selectionBg={COLOR.accentStrong}
      keyBindings={[
        { name: "return", action: "submit" },
        { name: "kpenter", action: "submit" },
        { name: "linefeed", action: "submit" },
      ]}
      onSubmit={() => callbacks.current.onSubmit()}
      onContentChange={() => {
        const input = ta.current;
        if (input) callbacks.current.onChange(input.plainText);
      }}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onMouseDown={() => {
        if (!disabled) ta.current?.focus();
      }}
      ref={(renderable: TextareaRenderable | null) => {
        ta.current = renderable;
      }}
    />
  );
}
