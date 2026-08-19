/* @jsxImportSource @opentui/react */
import { createCliRenderer, type KeyEvent } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import process from "node:process";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bootstrapConfiguration, getBootstrapError } from "@/application/bootstrap.js";
import { executeReprompt } from "@/application/reprompt.js";
import { readClipboard, writeClipboard } from "@/apps/cli/clipboard/clipboard.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import { parseLevel } from "@/core/levels.js";
import { createUiRepromptInput } from "@/apps/cli/ui/app-actions.js";
import {
  applyLoadedConfig,
  completeGeneration,
  createInitialAppState,
  selectLevel,
  selectModel,
  selectProfile,
  selectProvider,
  resetSession,
  showView,
  toggleDiffView,
  updatePromptInput,
  type AppState,
} from "@/apps/cli/ui/app-state.js";
import { describeUiError } from "@/shared/errors.js";
import {
  beginGeneration,
  canStartGeneration,
  completeCopy,
  failCopy,
  failGeneration,
} from "@/apps/cli/ui/generation-state.js";
import {
  getFallbackModelForProvider,
  getModelOptions,
  getProfileOptions,
  getProviderOptions,
  LEVEL_OPTIONS,
} from "@/apps/cli/ui/modal-options.js";
import { createOpenTuiRendererOptions } from "@/apps/cli/opentui/renderer-options.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";

import {
  EditorScreen,
  type PickerOverlayId,
  type ToastState,
} from "@/apps/cli/tui/screens/EditorScreen.js";
import { useKeyboardRouting } from "@/apps/cli/tui/app/use-keyboard-routing.js";
import { toKeyPress } from "@/apps/cli/tui/app/keyboard.js";
import type { OverlayRoute } from "@/apps/cli/tui/model/keymap.js";
import {
  INITIAL_FOCUS,
  focusNext,
  focusPrevious,
  restoreFocus,
  suspendFocus,
  type FocusState,
} from "@/apps/cli/tui/model/focus.js";
import {
  INITIAL_OVERLAY,
  clampSelection,
  closeOverlay,
  moveSelection,
  openOverlay,
  setQuery,
  type OverlayState,
} from "@/apps/cli/tui/model/overlay.js";
import type { ResultState } from "@/apps/cli/tui/model/result-state.js";
import {
  availableCommands,
  type CommandContext,
  type CommandId,
} from "@/apps/cli/tui/model/commands.js";
import type { ToolbarValues } from "@/apps/cli/tui/components/Toolbar.js";

type Status = "idle" | "loading" | "streaming" | "success" | "error";

function isPickerOverlay(active: OverlayState["active"]): active is PickerOverlayId {
  return active === "profile" || active === "level" || active === "provider" || active === "model";
}

function toResultState(app: AppState, status: Status, partialText: string): ResultState {
  if (status === "error" && !app.result && app.error) {
    return {
      kind: "error",
      title: app.error.title,
      message: app.error.message,
      nextAction: app.error.nextAction,
    };
  }
  if (status === "loading") return { kind: "loading" };
  if (status === "streaming") return { kind: "streaming", partial: partialText };
  if (app.result) {
    const { result } = app;
    return {
      kind: "success",
      text: result.rewritten,
      quality: result.quality,
      original: result.original,
      changes: result.changes,
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
    };
  }
  return { kind: "empty" };
}

export async function runOpenTuiAppV2(t: Translator = createTranslator("en")): Promise<void> {
  const renderer = await createCliRenderer(createOpenTuiRendererOptions());
  createRoot(renderer).render(
    <OpenTuiApp
      t={t}
      onExit={() => {
        renderer.stop();
      }}
    />,
  );
}

interface OpenTuiAppProps {
  t: Translator;
  onExit(): void;
}

function OpenTuiApp({ t, onExit }: Readonly<OpenTuiAppProps>): React.ReactNode {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();

  const [app, setApp] = useState<AppState>(() => createInitialAppState(DEFAULT_CONFIG));
  const [config, setConfig] = useState<Config | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [partialText, setPartialText] = useState("");
  const [focus, setFocus] = useState<FocusState>(INITIAL_FOCUS);
  const [overlay, setOverlay] = useState<OverlayState>(INITIAL_OVERLAY);
  const [toast, setToast] = useState<ToastState | null>(null);

  const abortController = useRef<AbortController | null>(null);
  const generationInFlight = useRef(false);

  useEffect(() => {
    void bootstrapConfiguration(process.env)
      .then((result) => {
        const nextConfig = result.config;
        const bootstrapError = getBootstrapError(result);
        setConfig(nextConfig);
        setApp((prev) =>
          applyLoadedConfig(
            prev,
            nextConfig,
            bootstrapError ? describeUiError(bootstrapError, nextConfig.defaultProvider, t) : null,
          ),
        );
        if (bootstrapError) setStatus("error");
      })
      .catch((error: unknown) => {
        setApp((prev) => ({
          ...prev,
          error: describeUiError(error, prev.provider, t),
        }));
        setStatus("error");
      })
      .finally(() => {
        setConfigReady(true);
      });
  }, [t]);

  const showToast = useCallback((message: string, tone: "success" | "neutral") => {
    setToast({ message, tone, key: Date.now() });
  }, []);

  const clearToastAfter = useCallback((key: number) => {
    setTimeout(() => {
      setToast((current) => (current !== null && current.key === key ? null : current));
    }, 1_500);
  }, []);

  const closeOverlayAndRestore = useCallback(() => {
    setOverlay(closeOverlay);
    setFocus(restoreFocus);
  }, []);

  const openOverlayAndSuspend = useCallback((overlayId: NonNullable<OverlayState["active"]>) => {
    setOverlay(openOverlay(INITIAL_OVERLAY, overlayId));
    setFocus(suspendFocus);
  }, []);

  const generate = useCallback(async (): Promise<void> => {
    if (generationInFlight.current) return;
    if (!canStartGeneration(app.input, false)) return;

    generationInFlight.current = true;
    const controller = new AbortController();
    abortController.current = controller;
    setStatus("loading");
    setFocus({ zone: "result", suspended: null });
    setPartialText("");
    setApp((prev) => beginGeneration(prev));

    try {
      const { result } = await executeReprompt({
        ...createUiRepromptInput(app, config, process.env),
        signal: controller.signal,
        onDelta: (chunk) => {
          setStatus("streaming");
          setPartialText((previous) => previous + chunk);
        },
      });
      setApp((prev) => completeGeneration(prev, result));
      setStatus("success");
    } catch (error) {
      if (!controller.signal.aborted) {
        setApp((prev) => failGeneration(prev, describeUiError(error, app.provider, t)));
        setStatus("error");
      } else {
        setStatus(app.result ? "success" : "idle");
      }
    } finally {
      abortController.current = null;
      generationInFlight.current = false;
      setPartialText("");
    }
  }, [app, config, t]);

  const copyResult = useCallback(async (): Promise<void> => {
    if (!app.result) return;
    try {
      await writeClipboard(app.result.rewritten);
      setApp((prev) => completeCopy(prev, true));
      showToast(`✓ ${t("tui.toast.copied")}`, "success");
    } catch (error) {
      setApp((prev) => failCopy(prev, describeUiError(error, app.provider, t)));
      setStatus("error");
    }
  }, [app.result, app.provider, showToast, t]);

  const pasteFromClipboard = useCallback(async (): Promise<void> => {
    try {
      const content = await readClipboard();
      if (!content) return;
      setApp((prev) => updatePromptInput(prev, `${prev.input}${content}`));
      setFocus({ zone: "editor", suspended: null });
    } catch (error) {
      setApp((prev) => failGeneration(prev, describeUiError(error, prev.provider, t)));
      setStatus("error");
    }
  }, [t]);

  const reset = useCallback((): void => {
    abortController.current?.abort();
    setPartialText("");
    setStatus("idle");
    setApp(resetSession);
    setFocus({ zone: "editor", suspended: null });
    setOverlay(INITIAL_OVERLAY);
    const key = Date.now();
    setToast({ message: `↺ ${t("tui.toast.reset")}`, tone: "neutral", key });
    clearToastAfter(key);
  }, [clearToastAfter, t]);

  const onCommand = useCallback(
    (id: CommandId): void => {
      const options = { hasResult: Boolean(app.result) };
      switch (id) {
        case "generate":
          void generate();
          break;
        case "cancel":
          abortController.current?.abort();
          showToast(t("tui.toast.cancelled"), "neutral");
          break;
        case "copy":
          void copyResult();
          break;
        case "reset":
          reset();
          break;
        case "toggle-diff":
          setApp((prev) => toggleDiffView(prev, prev.input));
          break;
        case "show-explain":
          setApp((prev) => showView(prev, "explain"));
          break;
        case "open-profile":
        case "open-level":
        case "open-provider":
        case "open-model": {
          const map: Record<string, NonNullable<OverlayState["active"]>> = {
            "open-profile": "profile",
            "open-level": "level",
            "open-provider": "provider",
            "open-model": "model",
          };
          const target = map[id];
          if (target) openOverlayAndSuspend(target);
          break;
        }
        case "open-palette":
          openOverlayAndSuspend("palette");
          break;
        case "open-help":
          openOverlayAndSuspend("help");
          break;
        case "focus-next":
          setFocus((f) => focusNext(f, options));
          break;
        case "focus-previous":
          setFocus((f) => focusPrevious(f, options));
          break;
        case "close-overlay":
          closeOverlayAndRestore();
          break;
        case "paste":
          void pasteFromClipboard();
          break;
        case "exit":
          onExit();
          break;
      }
    },
    [
      app.result,
      closeOverlayAndRestore,
      copyResult,
      generate,
      onExit,
      openOverlayAndSuspend,
      pasteFromClipboard,
      reset,
      showToast,
      t,
    ],
  );

  const onOverlaySelect = useCallback(
    (overlayId: "profile" | "level" | "provider" | "model", value: string): void => {
      if (overlayId === "profile") setApp((prev) => selectProfile(prev, value));
      if (overlayId === "level") setApp((prev) => selectLevel(prev, parseLevel(value)));
      if (overlayId === "provider") {
        setApp((prev) => selectProvider(prev, value, getFallbackModelForProvider(value)));
      }
      if (overlayId === "model") setApp((prev) => selectModel(prev, value));
      closeOverlayAndRestore();
    },
    [closeOverlayAndRestore],
  );

  const context = useMemo(
    () => ({
      hasOverlay: overlay.active !== null,
      hasResult: Boolean(app.result),
      isGenerating: status === "loading" || status === "streaming",
      inputLength: app.input.length,
      editorFocused: focus.zone === "editor" && overlay.active === null,
    }),
    [app.input.length, app.result, focus.zone, overlay.active, status],
  );

  const overlayOptionCount = useMemo(() => {
    const active = overlay.active;
    if (active === null) return 0;
    switch (active) {
      case "profile":
        return getProfileOptions(t).length;
      case "level":
        return LEVEL_OPTIONS.length;
      case "provider":
        return getProviderOptions().length;
      case "model":
        return getModelOptions(app.provider).length;
      case "palette": {
        const needle = overlay.query.trim().toLowerCase();
        return availableCommands(context).filter(
          (command) => needle === "" || t(command.labelKey).toLowerCase().includes(needle),
        ).length;
      }
      default:
        return 0;
    }
  }, [overlay.active, overlay.query, app.provider, t, context]);

  const pickerOptions = useMemo(() => {
    switch (overlay.active) {
      case "profile":
        return getProfileOptions(t);
      case "level":
        return LEVEL_OPTIONS;
      case "provider":
        return getProviderOptions();
      case "model":
        return getModelOptions(app.provider);
      default:
        return [];
    }
  }, [overlay.active, app.provider, t]);

  const onOverlayRoute = useCallback(
    (route: OverlayRoute): void => {
      const active = overlay.active;
      if (route.kind === "overlay-nav" && active !== null) {
        setOverlay((state) =>
          clampSelection(moveSelection(state, route.dir, overlayOptionCount), overlayOptionCount),
        );
      }
      if (route.kind === "overlay-backspace" && active === "palette") {
        setOverlay((state) => setQuery(state, state.query.slice(0, -1)));
      }
      if (route.kind === "overlay-type" && active === "palette") {
        setOverlay((state) => setQuery(state, state.query + route.text));
      }
      if (route.kind === "overlay-select" && active !== null) {
        if (active === "palette") {
          selectPaletteCommand(overlay.query, overlay.index, context, t, onCommand);
        } else if (isPickerOverlay(active)) {
          const option = pickerOptions[Math.min(overlay.index, pickerOptions.length - 1)];
          if (option) onOverlaySelect(active, option.value);
        } else {
          // Help has nothing to select.
        }
        closeOverlayAndRestore();
      }
    },
    [
      closeOverlayAndRestore,
      onCommand,
      onOverlaySelect,
      overlay.active,
      overlay.index,
      overlay.query,
      overlayOptionCount,
      pickerOptions,
      context,
      t,
    ],
  );

  useKeyboardRouting(context, onCommand, onOverlayRoute);

  useKeyboard((event: KeyEvent) => {
    // Ctrl+C while generating aborts; otherwise the router already maps it to
    // exit. Keep the process-level interrupt in sync.
    const press = toKeyPress(event);
    if (press.ctrl && press.name === "c" && context.isGenerating) {
      abortController.current?.abort();
      showToast(t("tui.toast.cancelled"), "neutral");
    }
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

  const settings: ToolbarValues = {
    profile: app.profile,
    level: app.level,
    provider: app.provider,
    model: app.model,
  };

  if (!configReady) {
    return (
      <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
        <text>{t("tui.loading")}</text>
      </box>
    );
  }

  return (
    <EditorScreen
      width={width}
      height={height}
      prompt={app.input}
      result={toResultState(app, status, partialText)}
      view={app.view}
      focus={focus}
      overlay={overlay}
      settings={settings}
      ready={status !== "loading" && status !== "streaming"}
      toast={toast}
      t={t}
      onPromptChange={(value) => {
        setApp((prev) => updatePromptInput(prev, value));
      }}
      onCommand={onCommand}
      onOverlaySelect={onOverlaySelect}
    />
  );
}

function selectPaletteCommand(
  query: string,
  index: number,
  context: CommandContext,
  t: Translator,
  onCommand: (id: CommandId) => void,
): void {
  const needle = query.trim().toLowerCase();
  const commands = availableCommands(context).filter(
    (command) => needle === "" || t(command.labelKey).toLowerCase().includes(needle),
  );
  const command = commands[Math.min(index, Math.max(0, commands.length - 1))];
  if (command) onCommand(command.id);
}
