/* @jsxImportSource @opentui/react */
import React, { useCallback, useRef } from "react";
import type { TextareaRenderable } from "@opentui/core";
import { theme } from "@/apps/cli/tui/theme/index.js";

export interface TextEditorProps {
  value: string;
  focused: boolean;
  placeholder?: string;
  disabled?: boolean;
  height?: number;
  onChange(value: string): void;
  onSubmit?(): void;
}

/**
 * Multiline editor.
 *
 * Deliberately a thin façade over OpenTUI's `textarea`, which already owns the
 * hard parts: cursor, selection, word motions, backspace, paste, unicode and
 * undo. Reimplementing any of that by hand — as the current `app.tsx` does by
 * appending a block character to the string — produces an editor that looks
 * right until someone types an accent or pastes a line.
 *
 * The surface exposed here is only what Reqraft needs; the OpenTUI options
 * stay behind it so screens never learn the renderer's vocabulary. In
 * particular `onContentChange` carries no payload, so the current text is read
 * back from the renderable — a detail no caller should have to know.
 */
export function TextEditor({
  value,
  focused,
  placeholder,
  disabled = false,
  height,
  onChange,
  onSubmit,
}: Readonly<TextEditorProps>): React.ReactNode {
  const { tokens, components } = theme;
  const editor = useRef<TextareaRenderable | null>(null);

  const handleContentChange = useCallback(() => {
    const current = editor.current?.plainText;
    if (current !== undefined) onChange(current);
  }, [onChange]);

  return (
    <textarea
      ref={editor}
      focused={focused && !disabled}
      initialValue={value}
      placeholder={placeholder}
      placeholderColor={tokens.color.textMuted}
      textColor={disabled ? tokens.color.textMuted : tokens.color.text}
      focusedTextColor={tokens.color.text}
      backgroundColor={tokens.color.surface}
      focusedBackgroundColor={tokens.color.surfaceRaised}
      onContentChange={handleContentChange}
      onSubmit={onSubmit}
      style={{
        minHeight: height ?? components.editor.minimumHeight,
        paddingLeft: components.editor.paddingX,
        paddingRight: components.editor.paddingX,
      }}
    />
  );
}
