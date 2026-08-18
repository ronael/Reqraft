/* @jsxImportSource @opentui/react */
import React from "react";
import { Surface } from "@/apps/cli/tui/primitives/Surface.js";
import { TextEditor } from "@/apps/cli/tui/primitives/TextEditor.js";
import type { Density } from "@/apps/cli/tui/theme/components.js";

export interface PromptEditorProps {
  value: string;
  focused: boolean;
  rows: number;
  disabled?: boolean;
  meta?: string;
  density?: Density;
  placeholder?: string;
  onChange(value: string): void;
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
  onChange,
}: Readonly<PromptEditorProps>): React.ReactNode {
  return (
    <Surface title="prompt" meta={meta} tone="default" focused={focused} density={density}>
      <TextEditor
        value={value}
        focused={focused}
        disabled={disabled}
        height={rows}
        placeholder={placeholder}
        onChange={onChange}
      />
    </Surface>
  );
}
