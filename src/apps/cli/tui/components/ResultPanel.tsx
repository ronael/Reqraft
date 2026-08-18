/* @jsxImportSource @opentui/react */
import React from "react";
import { Surface } from "@/apps/cli/tui/primitives/Surface.js";
import { ScrollArea } from "@/apps/cli/tui/primitives/ScrollArea.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import type { ResultState } from "@/apps/cli/tui/model/result-state.js";
import type { Density, SurfaceTone } from "@/apps/cli/tui/theme/components.js";

export interface ResultPanelProps {
  state: ResultState;
  focused: boolean;
  height: number;
  density?: Density;
  emptyHint: string;
  loadingLabel: string;
}

/** Tone follows the state, so an error panel is the same component in red. */
function toneFor(state: ResultState): SurfaceTone {
  if (state.kind === "error") return "error";
  if (state.kind === "success") return "success";
  return "default";
}

/**
 * The result panel, driven by one explicit state rather than several booleans.
 * Every branch below maps to exactly one `ResultState` variant, so no
 * combination can render two things at once.
 */
export function ResultPanel({
  state,
  focused,
  height,
  density,
  emptyHint,
  loadingLabel,
}: Readonly<ResultPanelProps>): React.ReactNode {
  const { color } = theme.tokens;

  return (
    <Surface title="result" tone={toneFor(state)} focused={focused} density={density}>
      {state.kind === "empty" && <text fg={color.textMuted}>{emptyHint}</text>}

      {state.kind === "loading" && <text fg={color.accent}>{loadingLabel}</text>}

      {state.kind === "streaming" && (
        <ScrollArea height={height} focused={focused}>
          <text fg={color.textSubtle}>{state.partial}</text>
        </ScrollArea>
      )}

      {state.kind === "success" && (
        <ScrollArea height={height} focused={focused}>
          <text fg={color.text}>{state.text}</text>
        </ScrollArea>
      )}

      {state.kind === "error" && (
        <box style={{ flexDirection: "column" }}>
          <text fg={color.error}>{state.title}</text>
          <text fg={color.textSubtle}>{state.message}</text>
        </box>
      )}
    </Surface>
  );
}
