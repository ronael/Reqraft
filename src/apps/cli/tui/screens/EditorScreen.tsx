/* @jsxImportSource @opentui/react */
import React from "react";
import { PromptEditor } from "@/apps/cli/tui/components/PromptEditor.js";
import { Transcript } from "@/apps/cli/tui/components/Transcript.js";
import { Header } from "@/apps/cli/tui/components/Header.js";
import { StatusBar } from "@/apps/cli/tui/components/StatusBar.js";
import { SelectPicker } from "@/apps/cli/tui/components/SelectPicker.js";
import { CommandPalette } from "@/apps/cli/tui/components/CommandPalette.js";
import { HelpOverlay } from "@/apps/cli/tui/components/HelpOverlay.js";
import { TooSmall } from "@/apps/cli/tui/components/TooSmall.js";
import { Toast, type ToastTone } from "@/apps/cli/tui/components/Toast.js";
import { Stack } from "@/apps/cli/tui/primitives/Stack.js";
import { theme, editorSurfaceOverhead } from "@/apps/cli/tui/theme/index.js";
import { resolveLayout } from "@/apps/cli/tui/model/layout.js";
import { hasResult, isBusy, type ResultState } from "@/apps/cli/tui/model/result-state.js";
import {
  hasOverlay as isOverlayOpen,
  isActive,
  type OverlayState,
} from "@/apps/cli/tui/model/overlay.js";
import { isZoneFocused, type FocusState } from "@/apps/cli/tui/model/focus.js";
import {
  getModelOptions,
  getProfileOptions,
  getProviderOptions,
  LEVEL_OPTIONS,
} from "@/apps/cli/ui/modal-options.js";
import type { ResultViewMode } from "@/apps/cli/ui/result-view.js";
import type { CommandId } from "@/apps/cli/tui/model/commands.js";
import type { ToolbarValues } from "@/apps/cli/tui/components/Toolbar.js";
import type { Translator } from "@/i18n/translate.js";

export interface ToastState {
  message: string;
  tone: ToastTone;
  key: number;
}

export type PickerOverlayId = "profile" | "level" | "provider" | "model";

export interface EditorScreenProps {
  width: number;
  height: number;
  prompt: string;
  /** Snapshot of the submitted prompt, kept stable across edits after a run. */
  submittedPrompt: string | null;
  result: ResultState;
  view: ResultViewMode;
  focus: FocusState;
  overlay: OverlayState;
  settings: ToolbarValues;
  ready: boolean;
  toast: ToastState | null;
  t: Translator;
  onPromptChange(value: string): void;
  onCommand(id: CommandId): void;
  /** Selecting a value in a picker overlay, distinct from a CommandId. */
  onOverlaySelect(overlay: PickerOverlayId, value: string): void;
}

/**
 * The main screen: composition only.
 *
 * It decides where things go, not what they mean. Generation, providers and
 * parsing arrive as `result`/`settings` and leave as `onCommand`. The
 * composition is a single vertical flow — header, transcript, editor, footer —
 * with overlays and toasts floating above it.
 */
export function EditorScreen({
  width,
  height,
  prompt,
  submittedPrompt,
  result,
  view,
  focus,
  overlay,
  settings,
  ready,
  toast,
  t,
  onPromptChange,
  onCommand,
  onOverlaySelect,
}: Readonly<EditorScreenProps>): React.ReactNode {
  const layout = resolveLayout(width, height, undefined, {
    comfortable: editorSurfaceOverhead(theme.components, "comfortable"),
    compact: editorSurfaceOverhead(theme.components, "compact"),
  });
  const { color } = theme.tokens;
  const density = layout.mode === "compact" ? "compact" : "comfortable";

  const context = {
    hasOverlay: isOverlayOpen(overlay),
    hasResult: hasResult(result),
    isGenerating: isBusy(result),
    inputLength: prompt.length,
  };

  if (layout.mode === "too-small") {
    return (
      <box
        style={{
          flexDirection: "column",
          backgroundColor: color.background,
          width: "100%",
          height: "100%",
        }}
      >
        <TooSmall t={t} />
      </box>
    );
  }

  const editor = (
    <PromptEditor
      value={prompt}
      focused={isZoneFocused(focus, "editor")}
      rows={layout.editorRows}
      disabled={isBusy(result)}
      density={density}
      meta={layout.showMetadata ? settings.model : undefined}
      t={t}
      onChange={onPromptChange}
    />
  );

  return (
    <box
      style={{
        flexDirection: "column",
        backgroundColor: color.background,
        gap: theme.tokens.spacing.xs,
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      {layout.showHeader && (
        <Header
          values={settings}
          ready={ready}
          t={t}
          compact={!layout.showMetadata}
          onActivate={onCommand}
        />
      )}

      <Stack direction="column" gap="xs" grow>
        <Transcript
          livePrompt={prompt}
          submittedPrompt={submittedPrompt}
          state={result}
          view={view}
          context={context}
          height={layout.transcriptRows}
          focused={isZoneFocused(focus, "result")}
          t={t}
          onCommand={onCommand}
        />
        {editor}
      </Stack>

      {layout.showStatusBar && <StatusBar context={context} t={t} />}

      {isOverlayOpen(overlay) && (
        <Overlays
          overlay={overlay}
          context={context}
          settings={settings}
          width={width}
          t={t}
          onCommand={onCommand}
          onOverlaySelect={onOverlaySelect}
        />
      )}

      {toast !== null && <Toast key={toast.key} message={toast.message} tone={toast.tone} />}
    </box>
  );
}

function Overlays({
  overlay,
  context,
  settings,
  width,
  t,
  onCommand,
  onOverlaySelect,
}: Readonly<{
  overlay: OverlayState;
  context: Parameters<typeof StatusBar>[0]["context"];
  settings: ToolbarValues;
  width: number;
  t: Translator;
  onCommand(id: CommandId): void;
  onOverlaySelect(overlay: PickerOverlayId, value: string): void;
}>): React.ReactNode {
  const pickers: {
    id: PickerOverlayId;
    title: string;
    options: { label: string; value: string }[];
    current: string;
  }[] = [
    {
      id: "profile",
      title: t("tui.changeProfile"),
      options: getProfileOptions(t),
      current: settings.profile,
    },
    {
      id: "level",
      title: t("tui.changeLevel"),
      options: LEVEL_OPTIONS,
      current: settings.level,
    },
    {
      id: "provider",
      title: t("tui.changeProvider"),
      options: getProviderOptions(),
      current: settings.provider,
    },
    {
      id: "model",
      title: t("tui.changeModel"),
      options: getModelOptions(settings.provider),
      current: settings.model,
    },
  ];

  const activePicker = pickers.find((picker) => isActive(overlay, picker.id));

  if (activePicker) {
    return (
      <SelectPicker
        title={activePicker.title}
        open
        options={activePicker.options}
        currentValue={activePicker.current}
        highlighted={overlay.index}
        terminalWidth={width}
        t={t}
        onSelect={(value) => {
          onOverlaySelect(activePicker.id, value);
        }}
      />
    );
  }

  if (isActive(overlay, "palette")) {
    return (
      <CommandPalette
        open
        context={context}
        query={overlay.query}
        highlighted={overlay.index}
        terminalWidth={width}
        t={t}
        onSelect={onCommand}
      />
    );
  }

  if (isActive(overlay, "help")) {
    return <HelpOverlay open terminalWidth={width} t={t} />;
  }

  return null;
}
