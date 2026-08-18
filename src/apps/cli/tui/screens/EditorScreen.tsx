/* @jsxImportSource @opentui/react */
import React from "react";
import { PromptEditor } from "@/apps/cli/tui/components/PromptEditor.js";
import { ResultPanel } from "@/apps/cli/tui/components/ResultPanel.js";
import { StatusBar } from "@/apps/cli/tui/components/StatusBar.js";
import { Toolbar, type ToolbarValues } from "@/apps/cli/tui/components/Toolbar.js";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { resolveLayout } from "@/apps/cli/tui/model/layout.js";
import { hasResult, isBusy, type ResultState } from "@/apps/cli/tui/model/result-state.js";
import type { CommandId } from "@/apps/cli/tui/model/commands.js";
import type { FocusState } from "@/apps/cli/tui/model/focus.js";
import type { Translator } from "@/i18n/translate.js";

export interface EditorScreenProps {
  width: number;
  height: number;
  prompt: string;
  result: ResultState;
  focus: FocusState;
  settings: ToolbarValues;
  t: Translator;
  onPromptChange(value: string): void;
  onCommand(id: CommandId): void;
}

/**
 * The main screen: composition only.
 *
 * It decides where things go, not what they mean. No provider, no prompt
 * building, no parsing — those arrive as `result` and leave as `onCommand`.
 * Layout questions are delegated to `model/layout.ts` so the branching here
 * stays readable and the thresholds stay testable without a renderer.
 */
export function EditorScreen({
  width,
  height,
  prompt,
  result,
  focus,
  settings,
  t,
  onPromptChange,
  onCommand,
}: Readonly<EditorScreenProps>): React.ReactNode {
  const layout = resolveLayout(width, height);
  const { color, spacing } = theme.tokens;

  const commandContext = {
    hasOverlay: focus.suspended !== null,
    hasResult: hasResult(result),
    isGenerating: isBusy(result),
    inputLength: prompt.length,
  };

  const editor = (
    <PromptEditor
      value={prompt}
      focused={focus.zone === "editor"}
      rows={layout.editorRows}
      disabled={isBusy(result)}
      density={layout.mode === "compact" ? "compact" : "comfortable"}
      meta={layout.showMetadata ? settings.model : undefined}
      onChange={onPromptChange}
    />
  );

  const panel = (
    <ResultPanel
      state={result}
      focused={focus.zone === "result"}
      height={Math.max(1, layout.editorRows)}
      density={layout.mode === "compact" ? "compact" : "comfortable"}
      emptyHint={t("tui.result.empty")}
      loadingLabel={t("tui.result.loading")}
    />
  );

  return (
    <box
      style={{
        flexDirection: "column",
        backgroundColor: color.background,
        gap: spacing.xs,
        width: "100%",
        height: "100%",
      }}
    >
      {layout.showMetadata && (
        <Toolbar values={settings} compact={layout.mode === "compact"} onActivate={onCommand} />
      )}

      {layout.splitColumns ? (
        <Stack direction="row" gap="xs" grow>
          {editor}
          {panel}
        </Stack>
      ) : (
        <Stack direction="column" gap="xs" grow>
          {editor}
          {panel}
        </Stack>
      )}

      {layout.showStatusBar && <StatusBar context={commandContext} t={t} />}
    </box>
  );
}
