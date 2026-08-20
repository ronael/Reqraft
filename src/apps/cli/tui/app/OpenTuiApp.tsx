/* @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core";
import { createRoot, useRenderer, useTerminalDimensions } from "@opentui/react";
import process from "node:process";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  bootstrapConfiguration,
  getBootstrapError,
  type BootstrapResult,
} from "@/application/bootstrap.js";
import {
  executeReprompt,
  type ExecuteRepromptInput,
  type ExecuteRepromptResult,
} from "@/application/reprompt.js";
import { readClipboard, writeClipboard } from "@/apps/cli/clipboard/clipboard.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import { parseLevel } from "@/core/levels.js";
import { previewRewritten } from "@/core/stream-preview.js";
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
import { describeUiError, type UiError } from "@/shared/errors.js";
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
import { toResultState, type AppStatus } from "@/apps/cli/tui/model/app-result.js";
import {
  availableCommands,
  type CommandContext,
  type CommandId,
} from "@/apps/cli/tui/model/commands.js";
import type { ToolbarValues } from "@/apps/cli/tui/components/Toolbar.js";

type Status = AppStatus;

/**
 * The minimal set of side-effecting operations the TUI needs. Everything that
 * touches a network or the system clipboard goes through here so tests can
 * inject fakes — no real provider, no real clipboard.
 */
export interface TuiServices {
  bootstrap(env: NodeJS.ProcessEnv): Promise<BootstrapResult>;
  execute(input: ExecuteRepromptInput): Promise<ExecuteRepromptResult>;
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;
  describeError(error: unknown, provider: string, t: Translator): UiError;
}

const DEFAULT_SERVICES: TuiServices = {
  bootstrap: bootstrapConfiguration,
  execute: executeReprompt,
  readClipboard,
  writeClipboard,
  describeError: describeUiError,
};
function isPickerOverlay(active: OverlayState["active"]): active is PickerOverlayId {
  return active === "profile" || active === "level" || active === "provider" || active === "model";
}

/** Commands that, selected from the palette, open another overlay instead of running. */
const OVERLAY_OPENING_COMMANDS: ReadonlySet<CommandId> = new Set([
  "open-profile",
  "open-level",
  "open-provider",
  "open-model",
  "open-palette",
  "open-help",
]);

export async function runOpenTuiAppV2(
  t: Translator = createTranslator("en"),
  services: TuiServices = DEFAULT_SERVICES,
): Promise<void> {
  const renderer = await createCliRenderer(createOpenTuiRendererOptions());
  createRoot(renderer).render(
    <OpenTuiApp
      t={t}
      services={services}
      onExit={() => {
        // `destroy()`, not `stop()`. `stop()` only halts the render loop — it
        // belongs to the start/pause/resume lifecycle and leaves the terminal
        // in raw mode with stdin still captured, so Ctrl+C stopped the drawing
        // and then hung with no way out. `destroy()` runs the teardown that
        // restores the terminal and releases the input handles.
        renderer.destroy();
      }}
    />,
  );
}

interface OpenTuiAppProps {
  t: Translator;
  services: TuiServices;
  onExit(): void;
}

const TOAST_MS = 1_500;

/**
 * Exposed for the interaction tests: the real component, driven through fake
 * services. The production entry point is `runOpenTuiAppV2`.
 */
export function OpenTuiApp({ t, services, onExit }: Readonly<OpenTuiAppProps>): React.ReactNode {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();

  const [app, setApp] = useState<AppState>(() => createInitialAppState(DEFAULT_CONFIG));
  const [config, setConfig] = useState<Config | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [partialText, setPartialText] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusState>(INITIAL_FOCUS);
  const [overlay, setOverlay] = useState<OverlayState>(INITIAL_OVERLAY);
  const [toast, setToast] = useState<ToastState | null>(null);

  const abortController = useRef<AbortController | null>(null);
  const generationInFlight = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Raw provider stream, kept apart from the decoded prose shown on screen. */
  const rawStream = useRef("");

  useEffect(() => {
    void services
      .bootstrap(process.env)
      .then((result) => {
        const nextConfig = result.config;
        const bootstrapError = getBootstrapError(result);
        setConfig(nextConfig);
        setApp((prev) =>
          applyLoadedConfig(
            prev,
            nextConfig,
            bootstrapError
              ? services.describeError(bootstrapError, nextConfig.defaultProvider, t)
              : null,
          ),
        );
        if (bootstrapError) setStatus("error");
      })
      .catch((error: unknown) => {
        setApp((prev) => ({
          ...prev,
          error: services.describeError(error, prev.provider, t),
        }));
        setStatus("error");
      })
      .finally(() => {
        setConfigReady(true);
      });
  }, [services, t]);

  /**
   * The single toast entry point: set the toast, then schedule its expiry.
   * A newer toast clears any pending timer, so an old timeout can never erase
   * a toast that replaced it.
   */
  const showToast = useCallback((message: string, tone: "success" | "neutral"): void => {
    const key = Date.now();
    setToast({ message, tone, key });
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((current) => (current !== null && current.key === key ? null : current));
    }, TOAST_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    };
  }, []);

  const closeOverlayAndRestore = useCallback(() => {
    setOverlay(closeOverlay);
    setFocus(restoreFocus);
  }, []);

  const openOverlayAndSuspend = useCallback((overlayId: NonNullable<OverlayState["active"]>) => {
    setOverlay(openOverlay(INITIAL_OVERLAY, overlayId));
    setFocus(suspendFocus);
  }, []);

  const focusEditorFromMouse = useCallback(() => {
    setFocus((current) =>
      current.suspended === null ? { zone: "editor", suspended: null } : current,
    );
  }, []);

  const generate = useCallback(async (): Promise<void> => {
    if (generationInFlight.current) return;
    if (!canStartGeneration(app.input, false)) return;

    generationInFlight.current = true;
    const controller = new AbortController();
    abortController.current = controller;
    setStatus("loading");
    setFocus({ zone: "result", suspended: null });
    rawStream.current = "";
    setPartialText("");
    setSubmittedPrompt(app.input);
    setApp((prev) => beginGeneration(prev));

    try {
      const { result } = await services.execute({
        ...createUiRepromptInput(app, config, process.env),
        signal: controller.signal,
        onDelta: (chunk) => {
          setStatus("streaming");
          // Accumulate the raw stream, but show only the prose. Providers
          // stream the whole JSON envelope, so pushing chunks straight to the
          // screen displayed `{"rewritten":"Avant de…` while the user waited.
          // `previewRewritten` is the decoder the desktop surface already uses;
          // it also holds back an escape cut in half by a chunk boundary.
          rawStream.current += chunk;
          const preview = previewRewritten(rawStream.current);
          if (preview.kind !== "pending") {
            setPartialText(preview.text);
          }
        },
      });
      setApp((prev) => completeGeneration(prev, result));
      setStatus("success");
    } catch (error) {
      if (!controller.signal.aborted) {
        setApp((prev) => failGeneration(prev, services.describeError(error, app.provider, t)));
        setStatus("error");
      } else {
        setStatus(app.result ? "success" : "idle");
      }
    } finally {
      abortController.current = null;
      generationInFlight.current = false;
      rawStream.current = "";
      setPartialText("");
    }
  }, [app, config, services, t]);

  const copyResult = useCallback(async (): Promise<void> => {
    if (!app.result) return;
    try {
      await services.writeClipboard(app.result.rewritten);
      setApp((prev) => completeCopy(prev, true));
      showToast(`✓ ${t("tui.toast.copied")}`, "success");
    } catch (error) {
      setApp((prev) => failCopy(prev, services.describeError(error, app.provider, t)));
      setStatus("error");
    }
  }, [app.result, app.provider, services, showToast, t]);

  const pasteFromClipboard = useCallback(async (): Promise<void> => {
    try {
      const content = await services.readClipboard();
      if (!content) return;
      setApp((prev) => updatePromptInput(prev, `${prev.input}${content}`));
      setFocus({ zone: "editor", suspended: null });
    } catch (error) {
      setApp((prev) => failGeneration(prev, services.describeError(error, prev.provider, t)));
      setStatus("error");
    }
  }, [services, t]);

  const reset = useCallback((): void => {
    abortController.current?.abort();
    rawStream.current = "";
    setPartialText("");
    setStatus("idle");
    setApp(resetSession);
    setSubmittedPrompt(null);
    setFocus({ zone: "editor", suspended: null });
    setOverlay(INITIAL_OVERLAY);
    showToast(`↺ ${t("tui.toast.reset")}`, "neutral");
  }, [showToast, t]);

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
    (overlayId: PickerOverlayId, value: string): void => {
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
      if (active === null) return;

      if (route.kind === "overlay-nav") {
        setOverlay((state) =>
          clampSelection(moveSelection(state, route.dir, overlayOptionCount), overlayOptionCount),
        );
        return;
      }
      if (route.kind === "overlay-backspace" && active === "palette") {
        setOverlay((state) => setQuery(state, state.query.slice(0, -1)));
        return;
      }
      if (route.kind === "overlay-type" && active === "palette") {
        setOverlay((state) => setQuery(state, state.query + route.text));
        return;
      }
      if (route.kind === "overlay-select") {
        applyOverlaySelection(
          active,
          overlay.query,
          overlay.index,
          pickerOptions,
          context,
          t,
          onCommand,
          onOverlaySelect,
          closeOverlayAndRestore,
        );
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

  // Ctrl+C is routed exactly once, by useKeyboardRouting -> routeKey (cancel or
  // exit). The process-level SIGINT handler below is only a safety net for
  // signals that arrive outside the keyboard path; it never duplicates the
  // toast, which the keyboard route owns.
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
      submittedPrompt={submittedPrompt}
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
      onFocusEditor={focusEditorFromMouse}
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
): CommandId | null {
  const needle = query.trim().toLowerCase();
  const commands = availableCommands(context).filter(
    (command) => needle === "" || t(command.labelKey).toLowerCase().includes(needle),
  );
  const command = commands[Math.min(index, Math.max(0, commands.length - 1))];
  return command ? command.id : null;
}

function applyOverlaySelection(
  active: NonNullable<OverlayState["active"]>,
  query: string,
  index: number,
  pickerOptions: { label: string; value: string }[],
  context: CommandContext,
  t: Translator,
  onCommand: (id: CommandId) => void,
  onOverlaySelect: (overlay: PickerOverlayId, value: string) => void,
  closeOverlayAndRestore: () => void,
): void {
  if (active === "palette") {
    const commandId = selectPaletteCommand(query, index, context, t);
    if (commandId === null) return;
    if (OVERLAY_OPENING_COMMANDS.has(commandId)) {
      // The chosen command opens the next overlay; it takes over, so the
      // palette must NOT be closed underneath it.
      onCommand(commandId);
    } else {
      closeOverlayAndRestore();
      onCommand(commandId);
    }
    return;
  }
  if (isPickerOverlay(active)) {
    const option = pickerOptions[Math.min(index, pickerOptions.length - 1)];
    if (option) {
      onOverlaySelect(active, option.value);
    }
  }
  // Help has nothing to select.
}
