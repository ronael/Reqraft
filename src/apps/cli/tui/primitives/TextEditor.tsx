/* @jsxImportSource @opentui/react */
import React, { useCallback, useEffect, useRef } from "react";
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
 * stay behind it so screens never learn the renderer's vocabulary. Two such
 * details are handled here rather than by callers:
 *
 * - `onContentChange` carries no payload, so the current text is read back
 *   from the renderable.
 * - `initialValue` is latched by OpenTUI after the first render, so on its own
 *   it would make this an uncontrolled component: a session reset or a
 *   programmatic prompt replacement would leave stale text on screen. The
 *   effect below closes that gap, which is what lets `value` behave like the
 *   prop its name promises.
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

  useEffect(() => {
    const renderable = editor.current;
    // Comparing first is what stops a feedback loop: the keystroke the user
    // just made comes back as `value`, and rewriting the buffer for it would
    // move the cursor out from under them.
    if (renderable === null || renderable.plainText === value) return;

    if (value === "") {
      // A reset is a clean slate — undo must not resurrect the previous
      // session's prompt.
      renderable.setText("");
    } else {
      // Any other external replacement stays undoable.
      renderable.replaceText(value);
    }
  }, [value]);

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
