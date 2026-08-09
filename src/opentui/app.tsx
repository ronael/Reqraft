/* @jsxImportSource @opentui/react */
import { createCliRenderer, TextAttributes, type KeyEvent, type MouseEvent } from "@opentui/core";
import {
  createRoot,
  useKeyboard,
  usePaste,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import process from "node:process";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bootstrapConfiguration, getBootstrapError } from "../application/bootstrap.js";
import { executeReprompt } from "../application/reprompt.js";
import { readClipboard, writeClipboard } from "../clipboard/clipboard.js";
import { DEFAULT_CONFIG } from "../config/loader.js";
import type { Config } from "../config/schema.js";
import type { RepromptLevel } from "../core/types.js";
import { parseLevel } from "../core/levels.js";
import { createUiRepromptInput } from "../ui/app-actions.js";
import {
  applyLoadedConfig,
  clearCopyToast,
  completeGeneration,
  createInitialAppState,
  openModal,
  selectLevel,
  selectModel,
  selectProfile,
  selectProvider,
  resetSession,
  showView,
  toggleDiffView,
  updatePromptInput,
  type AppState,
  type ModalType,
} from "../ui/app-state.js";
import { describeUiError, type UiError } from "../ui/errors.js";
import {
  beginGeneration,
  canStartGeneration,
  completeCopy,
  failCopy,
  failGeneration,
} from "../ui/generation-state.js";
import {
  getFallbackModelForProvider,
  getModelOptions,
  getProfileOptions,
  getProviderOptions,
  LEVEL_OPTIONS,
} from "../ui/modal-options.js";
import { resolveSubmit, describeInput } from "../ui/prompt-input.js";
import { createLayout, pickerOptionIndexAt, type Layout } from "./layout.js";
import {
  appendPastedText,
  decodePastedText,
  isCtrlCKey,
  isCtrlVKey,
  normalizeTypedText,
} from "./input.js";
import { SHORTCUTS } from "./shortcuts-view.js";
import { actionLines, shortModel } from "./text.js";
import { createOpenTuiRendererOptions } from "./renderer-options.js";
import {
  resolveVisibleResult,
  resultMeta,
  resultTitle,
  resultTone,
  type TuiStatus,
} from "./result-presentation.js";
import { COLOR, toneColor } from "./theme.js";
import { TextViewport } from "./text-viewport.js";

type OverlayId = Exclude<ModalType, "commands">;
type FocusElement = "editor" | "result";
export async function runOpenTuiApp(): Promise<void> {
  const renderer = await createCliRenderer(createOpenTuiRendererOptions());
  createRoot(renderer).render(<OpenTuiApp />);
}

function OpenTuiApp(): React.ReactNode {
  const renderer = useRenderer();
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions();
  const [state, setState] = useState<AppState>(createInitialAppState(DEFAULT_CONFIG));
  const [config, setConfig] = useState<Config | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const [status, setStatus] = useState<TuiStatus>("idle");
  const [partialText, setPartialText] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [focusedElement, setFocusedElement] = useState<FocusElement>("editor");
  const [pickerIndex, setPickerIndex] = useState(0);
  const abortController = useRef<AbortController | null>(null);
  const generationInFlight = useRef(false);

  const layout = useMemo(
    () => createLayout(terminalWidth, terminalHeight, state.provider, state.model),
    [terminalWidth, terminalHeight, state.provider, state.model],
  );

  useEffect(() => {
    void bootstrapConfiguration(process.env)
      .then((result) => {
        const nextConfig = result.config;
        const bootstrapError = getBootstrapError(result);
        setConfig(nextConfig);
        setState((prev) =>
          applyLoadedConfig(
            prev,
            nextConfig,
            bootstrapError ? describeUiError(bootstrapError, nextConfig.defaultProvider) : null,
          ),
        );
        if (bootstrapError) setStatus("error");
      })
      .catch((error: unknown) => {
        setState((prev) => ({
          ...prev,
          error: describeUiError(error, prev.provider),
        }));
        setStatus("error");
      })
      .finally(() => {
        setConfigReady(true);
      });
  }, []);

  const closeOverlay = useCallback((): void => {
    setState((prev) => ({ ...prev, modal: null }));
  }, []);

  const openOverlay = useCallback((overlay: Exclude<OverlayId, null>): void => {
    setState((prev) => openModal(prev, overlay));
    setPickerIndex(0);
  }, []);

  const generate = useCallback(async (): Promise<void> => {
    if (generationInFlight.current) {
      setFocusedElement("result");
      setStatus((current) => (current === "idle" ? "loading" : current));
      return;
    }
    if (!canStartGeneration(state.input, false)) return;
    generationInFlight.current = true;
    const controller = new AbortController();
    abortController.current = controller;
    setStatus("loading");
    setFocusedElement("result");
    setPartialText("");
    setStartedAt(Date.now());
    setState((prev) => beginGeneration(prev));

    try {
      const { result } = await executeReprompt({
        ...createUiRepromptInput(state, config, process.env),
        signal: controller.signal,
        onDelta: (chunk) => {
          setStatus("streaming");
          setPartialText((previous) => previous + chunk);
        },
      });
      setState((prev) => completeGeneration(prev, result));
      setStatus("success");
    } catch (error) {
      if (!controller.signal.aborted) {
        setState((prev) => failGeneration(prev, describeUiError(error, state.provider)));
        setStatus("error");
      } else {
        setStatus(state.result ? "success" : "idle");
      }
    } finally {
      abortController.current = null;
      generationInFlight.current = false;
      setPartialText("");
    }
  }, [config, state]);

  const resetResult = useCallback((): void => {
    abortController.current?.abort();
    setPartialText("");
    setStatus("idle");
    setState(resetSession);
    setFocusedElement("editor");
  }, []);

  const copyResult = useCallback(async (): Promise<void> => {
    if (!state.result) return;
    try {
      await writeClipboard(state.result.rewritten);
      setState((prev) => completeCopy(prev, true));
      setTimeout(() => {
        setState(clearCopyToast);
      }, 1_400);
    } catch (error) {
      setState((prev) => failCopy(prev, describeUiError(error, state.provider)));
      setStatus("error");
    }
  }, [state.provider, state.result]);

  const pasteFromClipboard = useCallback(async (): Promise<void> => {
    try {
      const content = await readClipboard();
      const pastedText = normalizeTypedText(content);
      if (!pastedText) return;
      setState((prev) => updatePromptInput(prev, `${prev.input}${pastedText}`));
      setFocusedElement("editor");
    } catch (error) {
      setState((prev) => failGeneration(prev, describeUiError(error, prev.provider)));
      setStatus("error");
    }
  }, []);

  usePaste((event) => {
    if (state.modal || focusedElement !== "editor") return;
    const pastedText = decodePastedText(event.bytes);
    setState((prev) => updatePromptInput(prev, appendPastedText(prev.input, pastedText)));
  });

  useEffect(() => {
    const onSigint = (): void => {
      if (generationInFlight.current) {
        abortController.current?.abort();
        return;
      }
      renderer.stop();
    };

    process.on("SIGINT", onSigint);
    return () => {
      process.off("SIGINT", onSigint);
    };
  }, [renderer]);

  useEffect(() => {
    const onMouse = (event: MouseEvent): void => {
      if (event.type !== "down" || event.button !== 0) return;
      if (state.modal && state.modal !== "help" && state.modal !== "commands") {
        const optionIndex = pickerOptionIndexAt(
          layout,
          event.y,
          optionsForOverlay(state.modal, state.provider).length,
        );
        if (optionIndex !== null) {
          selectOverlayValue({
            overlay: state.modal,
            optionIndex,
            provider: state.provider,
            setState,
          });
          return;
        }
      }

      const zone = layout.badgeZones.find(
        (candidate) =>
          event.y === candidate.row && event.x >= candidate.start && event.x <= candidate.end,
      );
      if (zone) openOverlay(zone.id);
    };

    renderer.on("mouse", onMouse);
    return () => {
      renderer.off("mouse", onMouse);
    };
  }, [layout, openOverlay, renderer, state.modal, state.provider]);

  useKeyboard((key: KeyEvent) => {
    if (
      handleInterruptKey(key, generationInFlight.current, abortController.current, () => {
        renderer.stop();
      })
    ) {
      return;
    }

    if (
      handleModalKey(
        key,
        state.modal,
        pickerIndex,
        setPickerIndex,
        state.provider,
        closeOverlay,
        setState,
      )
    ) {
      return;
    }

    if (key.name === "escape") {
      renderer.stop();
      return;
    }
    if (key.name === "tab") {
      setFocusedElement((previous) => (previous === "editor" ? "result" : "editor"));
      return;
    }
    if (
      handleCtrlShortcut(key, {
        copyResult,
        generate,
        hasResult: Boolean(state.result),
        input: state.input,
        openOverlay,
        pasteFromClipboard,
        resetResult,
        setState,
      })
    ) {
      return;
    }
    if (key.name === "?" && state.input.length === 0) {
      openOverlay("help");
      return;
    }
    if (focusedElement === "editor") {
      handleEditorKey(
        key,
        state.input,
        (input) => {
          setState((prev) => updatePromptInput(prev, input));
        },
        generate,
      );
    }
  });

  const visibleResult = resolveVisibleResult({
    state,
    partialText,
    status,
  });

  if (!configReady) {
    return (
      <RootFrame layout={layout}>
        <Header
          width={layout.width}
          provider="config"
          model="chargement"
          status="loading"
          compact={layout.compact}
        />
        <Panel title="Configuration" meta="chargement" tone="accent" focused>
          <TextViewport
            text="Chargement de la configuration Reqraft..."
            rows={4}
            width={layout.textWidth}
          />
        </Panel>
      </RootFrame>
    );
  }

  return (
    <RootFrame layout={layout}>
      <Header
        width={layout.width}
        provider={state.provider}
        model={state.model}
        status={status}
        compact={layout.compact}
      />

      <Panel
        title="Prompt original"
        meta={describeInput(state.input)}
        tone="accent"
        focused={focusedElement === "editor" && !state.modal}
      >
        <EditorViewport
          text={state.input}
          rows={layout.editorRows}
          width={layout.textWidth}
          focused={focusedElement === "editor" && !state.modal}
        />
      </Panel>

      <ContextBar
        profile={state.profile}
        level={state.level}
        provider={state.provider}
        model={state.model}
        compact={layout.compact}
      />

      <Panel
        title={resultTitle(state, status)}
        meta={resultMeta(state.result, status, startedAt)}
        tone={resultTone(status)}
        focused={focusedElement === "result" && !state.modal}
      >
        <ResultArea
          result={visibleResult}
          warnings={state.result?.warnings ?? []}
          error={state.error}
          status={status}
          rows={layout.resultRows}
          warningRows={layout.warningRows}
          textWidth={layout.textWidth}
          focused={focusedElement === "result" && !state.modal}
        />
      </Panel>

      <ActionBar status={status} width={layout.width} rows={layout.actionRows} />
      {state.copied && <Toast message="Résultat copié dans le presse-papiers." />}

      <Picker
        overlay={state.modal}
        provider={state.provider}
        profile={state.profile}
        level={state.level}
        model={state.model}
        highlighted={pickerIndex}
        layout={layout}
      />
    </RootFrame>
  );
}

function RootFrame({
  layout,
  children,
}: Readonly<{ layout: Layout; children: React.ReactNode }>): React.ReactNode {
  return (
    <box
      style={{
        width: layout.width,
        height: layout.height,
        flexDirection: "column",
        padding: layout.compact ? 0 : 1,
        rowGap: layout.compact ? 0 : 1,
        backgroundColor: COLOR.bg,
      }}
    >
      {children}
    </box>
  );
}

function Header({
  width,
  provider,
  model,
  status,
  compact,
}: Readonly<{
  width: number;
  provider: string;
  model: string;
  status: string;
  compact: boolean;
}>): React.ReactNode {
  return (
    <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <text>
        <span fg={COLOR.accent} attributes={TextAttributes.BOLD}>
          reqraft
        </span>
        {!compact && <span attributes={TextAttributes.DIM}> atelier de formulation</span>}
      </text>
      <text attributes={TextAttributes.DIM}>
        {compact
          ? `${provider} / ${status}`
          : `${provider} / ${model} / ${status} / ${String(width)} cols`}
      </text>
    </box>
  );
}

function Panel({
  title,
  meta,
  tone,
  focused,
  children,
}: Readonly<{
  title: string;
  meta?: string;
  tone: "accent" | "neutral" | "success" | "warning" | "error";
  focused?: boolean;
  children: React.ReactNode;
}>): React.ReactNode {
  return (
    <box
      style={{
        border: true,
        borderStyle: focused ? "double" : "single",
        borderColor: toneColor(tone),
        backgroundColor: COLOR.panel,
        padding: 1,
        flexDirection: "column",
        flexGrow: 0,
      }}
    >
      <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <text>
          <span fg={toneColor(tone)}>› </span>
          <span attributes={TextAttributes.BOLD}>{title}</span>
        </text>
        {meta && <text attributes={TextAttributes.DIM}>{meta}</text>}
      </box>
      {children}
    </box>
  );
}

function ContextBar({
  profile,
  level,
  provider,
  model,
  compact,
}: Readonly<{
  profile: string;
  level: string;
  provider: string;
  model: string;
  compact: boolean;
}>): React.ReactNode {
  const content = compact ? (
    <>
      <CompactBadge label="Profil" value={profile} shortcut="^P" />
      <CompactBadge label="Niveau" value={level} shortcut="^L" />
      <CompactBadge label="Provider" value={provider} shortcut="^I" />
      <CompactBadge label="Modèle" value={shortModel(model)} shortcut="^O" />
    </>
  ) : (
    <>
      <Badge label="profil" value={profile} shortcut="^P" />
      <Badge label="niveau" value={level} shortcut="^L" />
      <Badge label="provider" value={provider} shortcut="^I" />
      <Badge label="modèle" value={model} shortcut="^O" />
    </>
  );

  return <box style={{ flexDirection: "row", columnGap: 2, flexWrap: "wrap" }}>{content}</box>;
}

function CompactBadge({
  label,
  value,
  shortcut,
}: Readonly<{ label: string; value: string; shortcut: string }>): React.ReactNode {
  return (
    <text>
      <span attributes={TextAttributes.DIM}>{label}</span>
      <span> </span>
      <span fg={COLOR.text}>{value}</span>
      <span> </span>
      <span fg={COLOR.accent}>{shortcut}</span>
    </text>
  );
}

function Badge({
  label,
  value,
  shortcut,
}: Readonly<{ label: string; value: string; shortcut: string }>): React.ReactNode {
  return (
    <box
      style={{
        border: true,
        borderStyle: "single",
        borderColor: COLOR.borderSoft,
        flexDirection: "row",
        paddingLeft: 1,
        paddingRight: 1,
        columnGap: 1,
      }}
    >
      <text attributes={TextAttributes.DIM}>{label}</text>
      <text fg={COLOR.text}>{value}</text>
      <text fg={COLOR.accent}>{shortcut}</text>
    </box>
  );
}

function ResultArea({
  result,
  warnings,
  error,
  status,
  rows,
  warningRows,
  textWidth,
  focused,
}: Readonly<{
  result: string;
  warnings: string[];
  error: UiError | null;
  status: TuiStatus;
  rows: number;
  warningRows: number;
  textWidth: number;
  focused: boolean;
}>): React.ReactNode {
  const stateRows = rows + warningRows + 2;

  if (error && !result) {
    return (
      <box style={{ flexDirection: "column", height: stateRows, marginTop: 1, rowGap: 1 }}>
        <text fg={COLOR.error} attributes={TextAttributes.BOLD}>
          {error.title}
        </text>
        <text fg={COLOR.error}>{error.message}</text>
        {error.nextAction && <text attributes={TextAttributes.DIM}>{error.nextAction}</text>}
      </box>
    );
  }

  if (!result && status === "idle") {
    return (
      <box
        style={{ flexDirection: "column", height: stateRows, marginTop: 2, alignItems: "center" }}
      >
        <text attributes={TextAttributes.DIM}>Aucun résultat pour le moment.</text>
        <text attributes={TextAttributes.DIM}>Appuie sur Ctrl+G pour générer.</text>
      </box>
    );
  }

  if (!result && (status === "loading" || status === "streaming")) {
    return (
      <box
        style={{ flexDirection: "column", height: stateRows, marginTop: 2, alignItems: "center" }}
      >
        <text fg={COLOR.accent} attributes={TextAttributes.BOLD}>
          Génération en cours...
        </text>
        <text attributes={TextAttributes.DIM}>
          {status === "loading" ? "Préparation de la requête." : "Réception du résultat propre."}
        </text>
      </box>
    );
  }

  return (
    <box
      style={{
        flexDirection: "column",
        rowGap: 1,
        marginTop: 1,
        flexGrow: 0,
        backgroundColor: COLOR.panelSoft,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {error && (
        <TextViewport
          text={`! ${error.title} : ${error.message}`}
          rows={warningRows}
          width={textWidth}
          tone="error"
        />
      )}
      {!error && warnings.length > 0 && (
        <TextViewport
          text={`! Qualité à vérifier : ${warnings.join(" ")}`}
          rows={warningRows}
          width={textWidth}
          tone="warning"
          scrollable={false}
        />
      )}
      <TextViewport text={result} rows={rows} width={textWidth} focused={focused} />
    </box>
  );
}

function EditorViewport({
  text,
  rows,
  width,
  focused,
}: Readonly<{
  text: string;
  rows: number;
  width: number;
  focused: boolean;
}>): React.ReactNode {
  const value = focused ? `${text}█` : text;
  return (
    <box style={{ marginTop: 1 }}>
      <TextViewport text={value} rows={rows} width={width} focused={focused} />
    </box>
  );
}

function ActionBar({
  status,
  width,
  rows,
}: Readonly<{ status: string; width: number; rows: number }>): React.ReactNode {
  const lines = actionLines(width, rows, status, SHORTCUTS);
  return (
    <box style={{ width, height: rows, flexDirection: "column", backgroundColor: COLOR.bg }}>
      {lines.map((line, index) => (
        <text key={`${String(index)}-${line}`} attributes={TextAttributes.DIM} style={{ width }}>
          {line}
        </text>
      ))}
    </box>
  );
}

function Toast({ message }: Readonly<{ message: string }>): React.ReactNode {
  return (
    <box
      style={{
        position: "absolute",
        right: 2,
        bottom: 1,
        border: true,
        borderStyle: "single",
        borderColor: COLOR.success,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: COLOR.panelSoft,
        zIndex: 20,
      }}
    >
      <text fg={COLOR.success}>{message}</text>
    </box>
  );
}

function Picker({
  overlay,
  provider,
  profile,
  level,
  model,
  highlighted,
  layout,
}: Readonly<{
  overlay: ModalType;
  provider: string;
  profile: string;
  level: RepromptLevel;
  model: string;
  highlighted: number;
  layout: Layout;
}>): React.ReactNode {
  if (!overlay) return <box />;
  if (overlay === "help") return <HelpOverlay layout={layout} />;
  if (overlay === "commands") return <box />;

  const options = optionsForOverlay(overlay, provider);
  const currentValue = currentValueForOverlay({ overlay, profile, level, provider, model });
  const safeIndex = Math.min(highlighted, Math.max(0, options.length - 1));

  return (
    <box
      style={{
        position: "absolute",
        top: layout.pickerTop,
        left: layout.pickerLeft,
        width: layout.pickerWidth,
        border: true,
        borderStyle: "double",
        borderColor: COLOR.accent,
        backgroundColor: COLOR.panelSoft,
        padding: 1,
        zIndex: 10,
        flexDirection: "column",
        rowGap: layout.compact ? 0 : 1,
      }}
    >
      <text>
        <span fg={COLOR.accent}>⌘ </span>
        <span attributes={TextAttributes.BOLD}>{pickerTitle(overlay)}</span>
        <span attributes={TextAttributes.DIM}>
          {layout.compact ? "  ↑↓ · Entrée · Esc" : "  ↑↓ naviguer · Entrée choisir · Esc fermer"}
        </span>
      </text>
      {options.map((option, index) => (
        <text key={option.value}>
          <span fg={index === safeIndex ? COLOR.accent : COLOR.muted}>
            {index === safeIndex ? "›" : " "}
          </span>
          <span fg={option.value === currentValue ? COLOR.success : COLOR.subtle}>
            {option.value === currentValue ? " ● " : " ○ "}
          </span>
          <span attributes={index === safeIndex ? TextAttributes.BOLD : undefined}>
            {option.label}
          </span>
        </text>
      ))}
    </box>
  );
}

function HelpOverlay({ layout }: Readonly<{ layout: Layout }>): React.ReactNode {
  return (
    <box
      style={{
        position: "absolute",
        top: layout.pickerTop,
        left: layout.pickerLeft,
        width: layout.pickerWidth,
        border: true,
        borderStyle: "double",
        borderColor: COLOR.accent,
        backgroundColor: COLOR.panelSoft,
        padding: 1,
        zIndex: 10,
        flexDirection: "column",
        rowGap: 1,
      }}
    >
      <text attributes={TextAttributes.BOLD}>Aide Reqraft</text>
      <text>Ctrl+G génère. Ctrl+C interrompt une génération ou quitte.</text>
      <text>Ctrl+P, Ctrl+L, Ctrl+I, Ctrl+O ouvrent les pickers.</text>
      <text>Ctrl+D affiche le diff. Ctrl+E affiche les explications.</text>
      <text>Tab change le focus entre prompt et résultat.</text>
      <text attributes={TextAttributes.DIM}>Esc ferme cette aide.</text>
    </box>
  );
}

function handleInterruptKey(
  key: KeyEvent,
  isGenerating: boolean,
  controller: AbortController | null,
  stopRenderer: () => void,
): boolean {
  if (!isCtrlCKey(key)) return false;
  if (isGenerating) {
    controller?.abort();
  } else {
    stopRenderer();
  }
  return true;
}

function handleModalKey(
  key: KeyEvent,
  modal: ModalType,
  pickerIndex: number,
  setPickerIndex: React.Dispatch<React.SetStateAction<number>>,
  provider: string,
  closeOverlay: () => void,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
): boolean {
  if (!modal) return false;
  handleOverlayKey({
    key,
    stateOverlay: modal,
    pickerIndex,
    setPickerIndex,
    optionCount:
      modal === "help" || modal === "commands" ? 0 : optionsForOverlay(modal, provider).length,
    closeOverlay,
    selectValue: (optionIndex) => {
      selectOverlayValue({ overlay: modal, optionIndex, provider, setState });
    },
  });
  return true;
}

interface CtrlShortcutHandlers {
  copyResult(): Promise<void>;
  generate(): Promise<void>;
  hasResult: boolean;
  input: string;
  openOverlay(overlay: Exclude<OverlayId, null>): void;
  pasteFromClipboard(): Promise<void>;
  resetResult(): void;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

function handleCtrlShortcut(key: KeyEvent, handlers: CtrlShortcutHandlers): boolean {
  if (!key.ctrl) return false;
  const actions: Record<string, () => void> = {
    d: () => {
      if (handlers.hasResult) handlers.setState((prev) => toggleDiffView(prev, handlers.input));
    },
    e: () => {
      if (handlers.hasResult) handlers.setState((prev) => showView(prev, "explain"));
    },
    g: () => {
      void handlers.generate();
    },
    i: () => {
      handlers.openOverlay("provider");
    },
    l: () => {
      handlers.openOverlay("level");
    },
    o: () => {
      handlers.openOverlay("model");
    },
    p: () => {
      handlers.openOverlay("profile");
    },
    r: () => {
      handlers.resetResult();
    },
    v: () => {
      void handlers.pasteFromClipboard();
    },
    y: () => {
      void handlers.copyResult();
    },
  };
  const action = isCtrlVKey(key) ? actions.v : actions[key.name];
  action?.();
  return action !== undefined;
}

function handleOverlayKey({
  key,
  stateOverlay,
  pickerIndex,
  setPickerIndex,
  optionCount,
  closeOverlay,
  selectValue,
}: {
  key: KeyEvent;
  stateOverlay: ModalType;
  pickerIndex: number;
  setPickerIndex: React.Dispatch<React.SetStateAction<number>>;
  optionCount: number;
  closeOverlay: () => void;
  selectValue: (optionIndex: number) => void;
}): void {
  if (key.name === "escape") {
    closeOverlay();
    return;
  }
  if (stateOverlay === "help" || stateOverlay === "commands") return;
  if (key.name === "up") {
    setPickerIndex((previous) => Math.max(0, previous - 1));
    return;
  }
  if (key.name === "down") {
    setPickerIndex((previous) => Math.min(Math.max(0, optionCount - 1), previous + 1));
    return;
  }
  if (key.name === "return") {
    selectValue(Math.min(Math.max(0, optionCount - 1), pickerIndex));
  }
}

function selectOverlayValue({
  overlay,
  optionIndex,
  provider,
  setState,
}: {
  overlay: ModalType;
  optionIndex: number;
  provider: string;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}): void {
  if (!overlay || overlay === "help" || overlay === "commands") return;
  const option = optionsForOverlay(overlay, provider)[optionIndex];
  if (!option) return;
  if (overlay === "profile") setState((prev) => selectProfile(prev, option.value));
  if (overlay === "level") setState((prev) => selectLevel(prev, parseLevel(option.value)));
  if (overlay === "provider") {
    setState((prev) =>
      selectProvider(prev, option.value, getFallbackModelForProvider(option.value)),
    );
  }
  if (overlay === "model") setState((prev) => selectModel(prev, option.value));
}

function optionsForOverlay(
  overlay: Exclude<OverlayId, null>,
  provider: string,
): { label: string; value: string }[] {
  if (overlay === "profile") return getProfileOptions();
  if (overlay === "level") return LEVEL_OPTIONS;
  if (overlay === "provider") return getProviderOptions();
  if (overlay === "model") return getModelOptions(provider);
  return [];
}

function currentValueForOverlay({
  overlay,
  profile,
  level,
  provider,
  model,
}: {
  overlay: Exclude<OverlayId, null>;
  profile: string;
  level: RepromptLevel;
  provider: string;
  model: string;
}): string {
  if (overlay === "profile") return profile;
  if (overlay === "level") return level;
  if (overlay === "provider") return provider;
  if (overlay === "model") return model;
  return "";
}

function pickerTitle(overlay: Exclude<OverlayId, null>): string {
  if (overlay === "profile") return "Changer de profil";
  if (overlay === "level") return "Changer de niveau";
  if (overlay === "provider") return "Changer de provider";
  if (overlay === "model") return "Changer de modèle";
  return "Aide";
}

function handleEditorKey(
  key: KeyEvent,
  currentInput: string,
  setInput: (input: string) => void,
  generate: () => Promise<void>,
): void {
  if (key.name === "backspace" || key.name === "delete") {
    setInput(currentInput.slice(0, -1));
    return;
  }
  if (key.name === "return") {
    const outcome = resolveSubmit(currentInput);
    if (outcome.type === "newline") {
      setInput(outcome.input);
      return;
    }
    void generate();
    return;
  }
  if (key.ctrl || key.meta) return;
  const text = normalizeTypedText(key.sequence);
  if (!text) return;
  setInput(`${currentInput}${text}`);
}
