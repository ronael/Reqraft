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
  toggleView,
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
  NEW_PROFILE_OPTION,
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
  createProfileForm,
  cycleChoice,
  duplicateProfileForm,
  editProfileForm,
  findProfileFormProblem,
  moveField,
  profileFromForm,
  setFieldValue,
  currentField,
  type ProfileFormState,
} from "@/apps/cli/ui/profile-form.js";
import { profileFormProblemMessage } from "@/apps/cli/tui/components/ProfileForm.js";
import type { ProfileActionId } from "@/apps/cli/tui/components/ProfileActions.js";
import { profileActions } from "@/apps/cli/tui/components/ProfileActions.js";
import { getProfileOrigin } from "@/profiles/catalog.js";
import { getProfile } from "@/profiles/registry.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import { getBuiltinProfile, getBuiltinProfileByAlias } from "@/profiles/builtins.js";
import { CUSTOM_PROFILE_SCHEMA_VERSION, type CustomProfile } from "@/profiles/custom.js";
import { PROFILE_FORM_FIELDS } from "@/apps/cli/ui/profile-form.js";
import { createProfileServices, type ProfileServices } from "./profile-services.js";
import { toastDurationMs } from "@/apps/cli/ui/toast.js";
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
  /** Profile reads and writes, all delegating to the shared core. */
  profiles: ProfileServices;
  execute(input: ExecuteRepromptInput): Promise<ExecuteRepromptResult>;
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;
  describeError(error: unknown, provider: string, t: Translator): UiError;
}

/** The two profile overlays, named once so the id cannot drift between uses. */
const PROFILE_ACTIONS_OVERLAY = "profile-actions" as const;
const PALETTE_OVERLAY = "palette" as const;
const PROFILE_FORM_OVERLAY = "profile-form" as const;

const DEFAULT_SERVICES: TuiServices = {
  bootstrap: bootstrapConfiguration,
  profiles: createProfileServices(),
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
  /**
   * The profile the actions overlay applies to. Held apart from `overlay`,
   * whose shape is a list cursor and a query — nothing the actions or the form
   * could be squeezed into without making that shape mean two things.
   */
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  /** Set while a deletion waits for its confirmation. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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
    }, toastDurationMs(message));
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

  /**
   * Republishes the catalogue and tells the user what happened.
   *
   * Every mutation ends here, so a created, edited or deleted profile is
   * selectable in the picker of the running TUI without a restart: the picker
   * reads `getProfileOptions`, which reads the catalogue this refreshes.
   */
  const finishProfileMutation = useCallback(
    async (message: string): Promise<void> => {
      await services.profiles.reload();
      setForm(null);
      setActionTarget(null);
      setPendingDelete(null);
      closeOverlayAndRestore();
      showToast(message, "success");
    },
    [closeOverlayAndRestore, services, showToast],
  );

  const failProfileMutation = useCallback(
    (error: unknown): void => {
      const described = services.describeError(error, app.provider, t);
      setForm((current) =>
        current === null ? current : { ...current, saving: false, error: described.message },
      );
      showToast(described.title, "neutral");
    },
    [app.provider, services, showToast, t],
  );

  /** Opens the actions overlay for the profile highlighted in the picker. */
  const openProfileActions = useCallback((): void => {
    const options = getProfileOptions(t);
    const option = options[Math.min(overlay.index, Math.max(0, options.length - 1))];
    // `auto` is a mode, not a stored profile: it has nothing to act on.
    if (!option || option.value === AUTO_PROFILE_ID) return;
    setActionTarget(option.value);
    setPendingDelete(null);
    setOverlay(openOverlay(INITIAL_OVERLAY, PROFILE_ACTIONS_OVERLAY));
  }, [overlay.index, t]);

  const openProfileForm = useCallback((next: ProfileFormState): void => {
    setForm(next);
    setPendingDelete(null);
    setOverlay(openOverlay(INITIAL_OVERLAY, PROFILE_FORM_OVERLAY));
  }, []);

  /** Loads whichever profile the form should open on, of either origin. */
  const readProfileSource = useCallback(
    async (id: string, isLocal: boolean): Promise<CustomProfile | null> =>
      // A built-in has no stored file, so it is flattened the way
      // `profiles/transfer.ts` flattens it: the copy stays standalone.
      isLocal ? await services.profiles.read(id) : builtinAsCustomProfile(id),
    [services],
  );

  const requestProfileDelete = useCallback(
    async (id: string): Promise<void> => {
      // The default profile must not be left dangling: every later run would
      // fail on a profile nothing answers to.
      if ((await services.profiles.defaultProfile()) === id) {
        showToast(t("tui.profile.isDefault", { id }), "neutral");
        return;
      }
      setPendingDelete(id);
    },
    [services, showToast, t],
  );

  const runProfileAction = useCallback(
    async (action: ProfileActionId): Promise<void> => {
      if (action === "create") {
        openProfileForm(createProfileForm());
        return;
      }

      const target = actionTarget;
      if (target === null) return;
      const isLocal = getProfileOrigin(target) === "local";

      try {
        switch (action) {
          case "edit": {
            const source = await readProfileSource(target, isLocal);
            if (source !== null) openProfileForm(editProfileForm(source));
            return;
          }
          case "duplicate": {
            const source = await readProfileSource(target, isLocal);
            if (source !== null) openProfileForm(duplicateProfileForm(source));
            return;
          }
          case "open": {
            if (!isLocal) return;
            const path = await services.profiles.openInEditor(target);
            // No reload here: the editor is detached, so nothing can know when
            // the file is saved. The next mutation refreshes the catalogue.
            closeOverlayAndRestore();
            showToast(t("tui.profile.opened", { path }), "success");
            return;
          }
          case "export": {
            const path = await services.profiles.exportToFile(target);
            await finishProfileMutation(t("tui.profile.exported", { path }));
            return;
          }
          case "delete":
            await requestProfileDelete(target);
            return;
        }
      } catch (error) {
        failProfileMutation(error);
      }
    },
    [
      actionTarget,
      failProfileMutation,
      finishProfileMutation,
      closeOverlayAndRestore,
      openProfileForm,
      readProfileSource,
      requestProfileDelete,
      services,
      showToast,
      t,
    ],
  );

  const confirmProfileDelete = useCallback(async (): Promise<void> => {
    const id = pendingDelete;
    if (id === null) return;
    try {
      await services.profiles.remove(id);
      // A deleted profile must not stay selected, or the next generation would
      // fail on an id nothing answers to.
      setApp((prev) => (prev.profile === id ? selectProfile(prev, AUTO_PROFILE_ID) : prev));
      await finishProfileMutation(t("tui.profile.deleted", { id }));
    } catch (error) {
      failProfileMutation(error);
    }
  }, [failProfileMutation, finishProfileMutation, pendingDelete, services, t]);

  const submitProfileForm = useCallback(async (): Promise<void> => {
    const current = form;
    if (current === null || current.saving) return;

    const problem = findProfileFormProblem(current);
    if (problem) {
      setForm({
        ...current,
        field: PROFILE_FIELD_INDEX[problem.field] ?? 0,
        error: profileFormProblemMessage(problem.key, t),
      });
      return;
    }

    setForm({ ...current, saving: true, error: undefined });
    const profile = profileFromForm(current);
    try {
      if (current.mode === "edit") {
        await services.profiles.update(profile);
      } else {
        await services.profiles.create(profile);
      }
      // Selecting it is what makes "immediately usable" true rather than
      // merely listed: the next generation runs with it.
      setApp((prev) => selectProfile(prev, profile.id, profile.defaultLevel));
      await finishProfileMutation(t("tui.profile.saved", { id: profile.id }));
    } catch (error) {
      failProfileMutation(error);
    }
  }, [failProfileMutation, finishProfileMutation, form, services, t]);

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
          setApp((prev) => toggleView(prev, "diff"));
          break;
        case "show-explain":
          setApp((prev) => toggleView(prev, "explain"));
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
          // Escape always leaves, from every profile state: the form and the
          // confirmation are dropped rather than kept behind the picker.
          setForm(null);
          setActionTarget(null);
          setPendingDelete(null);
          closeOverlayAndRestore();
          break;
        case "profile-actions":
          openProfileActions();
          break;
        case "profile-save":
          void submitProfileForm();
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
      openProfileActions,
      submitProfileForm,
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
      if (overlayId === "profile" && value === NEW_PROFILE_OPTION) {
        // The row is an action, not a value: it opens the form instead of
        // selecting a profile that does not exist yet.
        openProfileForm(createProfileForm());
        return;
      }
      if (overlayId === "profile") {
        // The profile's own level comes along, unless the user pinned one.
        setApp((prev) => selectProfile(prev, value, getProfile(value)?.defaultLevel));
      }
      if (overlayId === "level") setApp((prev) => selectLevel(prev, parseLevel(value)));
      if (overlayId === "provider") {
        setApp((prev) => selectProvider(prev, value, getFallbackModelForProvider(value)));
      }
      if (overlayId === "model") setApp((prev) => selectModel(prev, value));
      closeOverlayAndRestore();
    },
    [closeOverlayAndRestore, openProfileForm],
  );

  const context = useMemo(
    () => ({
      hasOverlay: overlay.active !== null,
      hasResult: Boolean(app.result),
      isGenerating: status === "loading" || status === "streaming",
      inputLength: app.input.length,
      isProfilePicker: overlay.active === "profile",
      hasProfileForm: overlay.active === PROFILE_FORM_OVERLAY,
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
      case PROFILE_ACTIONS_OVERLAY:
        return profileActions(
          actionTarget !== null && getProfileOrigin(actionTarget) === "local",
          t,
        ).length;
      case "palette": {
        const needle = overlay.query.trim().toLowerCase();
        return availableCommands(context).filter(
          (command) => needle === "" || t(command.labelKey).toLowerCase().includes(needle),
        ).length;
      }
      default:
        return 0;
    }
  }, [overlay.active, overlay.query, app.provider, actionTarget, t, context]);

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

  /**
   * Enter inside the actions overlay.
   *
   * While a deletion waits, Enter is its confirmation and Escape — routed as
   * `close-overlay` — is the refusal, so removing a profile always takes a
   * second, deliberate key.
   */
  const confirmProfileActionRow = useCallback((): void => {
    if (pendingDelete !== null) {
      void confirmProfileDelete();
      return;
    }
    const entries = profileActions(
      actionTarget !== null && getProfileOrigin(actionTarget) === "local",
      t,
    );
    const entry = entries[Math.min(overlay.index, entries.length - 1)];
    // An unavailable row stays selectable but does nothing: its reason is
    // already on screen beside it.
    if (entry && entry.unavailable === undefined) void runProfileAction(entry.id);
  }, [actionTarget, confirmProfileDelete, overlay.index, pendingDelete, runProfileAction, t]);

  const onOverlayRoute = useCallback(
    (route: OverlayRoute): void => {
      const active = overlay.active;
      if (active === null) return;

      // The form is not a list: its keys are handled before the list routes,
      // which would otherwise move a cursor it does not have.
      if (active === PROFILE_FORM_OVERLAY) {
        routeProfileFormKey(route, setForm, submitProfileForm);
        return;
      }

      switch (route.kind) {
        case "overlay-nav":
          setOverlay((state) =>
            clampSelection(moveSelection(state, route.dir, overlayOptionCount), overlayOptionCount),
          );
          return;
        case "overlay-backspace":
          if (active === PALETTE_OVERLAY) {
            setOverlay((state) => setQuery(state, state.query.slice(0, -1)));
          }
          return;
        case "overlay-type":
          if (active === PALETTE_OVERLAY) {
            setOverlay((state) => setQuery(state, state.query + route.text));
          }
          return;
        case "overlay-select":
          if (active === PROFILE_ACTIONS_OVERLAY) {
            confirmProfileActionRow();
            return;
          }
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
          return;
        case "overlay-tab":
        case "overlay-adjust":
          // Only a form has fields to walk or values to adjust; a list overlay
          // has neither and lets these pass without effect.
          return;
      }
    },
    [
      closeOverlayAndRestore,
      confirmProfileActionRow,
      onCommand,
      onOverlaySelect,
      overlay.active,
      overlay.index,
      submitProfileForm,
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
      profileForm={form}
      profileTarget={actionTarget}
      profileTargetIsLocal={actionTarget !== null && getProfileOrigin(actionTarget) === "local"}
      pendingDelete={pendingDelete}
      onProfileInstructionsChange={(value) => {
        // The textarea owns its own keys, so its content arrives here rather
        // than through the overlay router.
        setForm((state) => (state === null ? state : setFieldValue(state, "instructions", value)));
      }}
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

/** Field id -> index, so a refused save can jump the cursor to the culprit. */
const PROFILE_FIELD_INDEX: Record<string, number> = Object.fromEntries(
  PROFILE_FORM_FIELDS.map((field, index) => [field.id, index]),
);

/**
 * A built-in seen as a custom profile, so the duplicate form can start from it.
 *
 * The instructions are copied in rather than referenced through `extends`,
 * matching `profiles/transfer.ts`: the copy has to keep working if the built-in
 * later changes its wording.
 */
function builtinAsCustomProfile(id: string): CustomProfile | null {
  const builtin = getBuiltinProfile(id) ?? getBuiltinProfileByAlias(id);
  if (!builtin) return null;
  return {
    schemaVersion: CUSTOM_PROFILE_SCHEMA_VERSION,
    id: builtin.id,
    name: builtin.name,
    description: builtin.description,
    defaultLevel: builtin.defaultLevel,
    instructions: builtin.instructions,
  };
}

/**
 * Keys inside the profile form.
 *
 * Tab walks the fields — including out of the multiline one, which does not
 * consume Tab. Up/down cycle a choice field and are otherwise left alone, so
 * they stay the textarea's cursor keys on the instructions field. Typing and
 * backspace edit the focused text field, but never the multiline one: the
 * textarea receives those keys directly and applying them here as well would
 * enter every character twice.
 */
function routeProfileFormKey(
  route: OverlayRoute,
  setForm: React.Dispatch<React.SetStateAction<ProfileFormState | null>>,
  submit: () => Promise<void>,
): void {
  if (route.kind === "overlay-tab") {
    setForm((state) => (state === null ? state : moveField(state, route.dir)));
    return;
  }
  if (route.kind === "overlay-nav" || route.kind === "overlay-adjust") {
    setForm((state) => (state === null ? state : cycleChoice(state, route.dir)));
    return;
  }
  if (route.kind === "overlay-select") {
    void submit();
    return;
  }

  const typed = route.kind === "overlay-type" ? route.text : null;
  setForm((state) => {
    if (state === null) return state;
    const field = currentField(state);
    // Only a plain text field is edited here. The multiline one receives its
    // keys straight from the textarea, and applying them again would enter
    // every character twice.
    if (field.kind !== "text") return state;
    const current = state.values[field.id];
    return setFieldValue(state, field.id, typed === null ? current.slice(0, -1) : current + typed);
  });
}
