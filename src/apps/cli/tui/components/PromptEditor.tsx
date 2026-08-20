/* @jsxImportSource @opentui/react */
import type { TextareaRenderable } from "@opentui/core";
import React, { useCallback, useRef } from "react";
import { Surface } from "@/apps/cli/tui/primitives/Surface.js";
import { TextEditor } from "@/apps/cli/tui/primitives/TextEditor.js";
import { editorSurfaceOverhead, theme, type Density } from "@/apps/cli/tui/theme/index.js";
import type { Translator } from "@/i18n/translate.js";

export interface PromptEditorProps {
  value: string;
  focused: boolean;
  rows: number;
  disabled?: boolean;
  meta?: string;
  density?: Density;
  placeholder?: string;
  t: Translator;
  onChange(value: string): void;
  onFocusRequest?(): void;
}

/**
 * The prompt panel: a surface around the editor primitive.
 *
 * Holds no generation logic — it does not know what a provider is. That keeps
 * it renderable in the lab and reusable by any screen.
 */
export function PromptEditor({
  value,
  focused,
  rows,
  disabled = false,
  meta,
  density,
  placeholder,
  t,
  onChange,
  onFocusRequest,
}: Readonly<PromptEditorProps>): React.ReactNode {
  const resolvedDensity = density ?? "comfortable";
  const height = rows + editorSurfaceOverhead(theme.components, resolvedDensity);
  const editor = useRef<TextareaRenderable | null>(null);

  const focusEditor = useCallback(() => {
    if (disabled) return;
    // A Surface owns the interaction region. Focusing the renderable here is
    // necessary when its React `focused` prop was already true: the prop has
    // not changed, but a click must still give the terminal cursor back.
    editor.current?.focus();
    onFocusRequest?.();
  }, [disabled, onFocusRequest]);

  return (
    <Surface
      id="prompt-editor-surface"
      title={t("tui.panel.prompt")}
      meta={meta}
      tone="default"
      focused={focused}
      density={resolvedDensity}
      height={height}
      onMouseDown={focusEditor}
    >
      <TextEditor
        value={value}
        focused={focused}
        disabled={disabled}
        height={rows}
        placeholder={placeholder}
        onChange={onChange}
        editorRef={editor}
      />
    </Surface>
  );
}
