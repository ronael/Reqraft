import { Box, Text, useApp, useInput } from "ink";
import process from "node:process";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { bootstrapConfiguration, getBootstrapError } from "./application/bootstrap.js";
import { executeReprompt } from "./application/reprompt.js";
import { writeClipboard } from "./clipboard/clipboard.js";
import { DEFAULT_CONFIG } from "./config/loader.js";
import type { Config } from "./config/schema.js";
import type { RepromptLevel } from "./core/types.js";
import { createUiRepromptInput } from "./ui/app-actions.js";
import {
  applyLoadedConfig,
  clearCopyToast,
  closeModal as closeModalState,
  completeGeneration,
  createInitialAppState,
  openModal,
  pinInput as pinInputState,
  selectLevel as selectLevelState,
  selectModel as selectModelState,
  selectProfile as selectProfileState,
  selectProvider as selectProviderState,
  showView,
  toggleDiffView,
  updatePromptInput,
  type AppState,
} from "./ui/app-state.js";
import { resolveCommandIntent } from "./ui/command-intents.js";
import {
  AppFrame,
  AppModal,
  Badge,
  HeaderBar,
  Panel,
  PromptField,
  ResultPanelBody,
  ShortcutBar,
  Toast,
} from "./ui/components/index.js";
import { describeUiError } from "./ui/errors.js";
import {
  beginGeneration,
  canStartGeneration,
  completeCopy,
  failCopy,
  failGeneration,
} from "./ui/generation-state.js";
import { useTerminalSize } from "./ui/hooks/use-terminal-size.js";
import { getFrameWidth, getLayoutMode } from "./ui/layout/responsive.js";
import { getFallbackModelForProvider, type ModalCommandAction } from "./ui/modal-options.js";
import { resolveShortcut, type ShortcutAction } from "./ui/shortcuts.js";
import { resolveShortcutIntent } from "./ui/shortcut-intents.js";
import { theme } from "./ui/theme/tokens.js";
import { getModalTitle, getResultTitle } from "./ui/view-labels.js";
import { getHeaderStatus } from "./ui/header-status.js";
import { describeInput, resolveSubmit } from "./ui/prompt-input.js";
import { describeResultMeta, getResultPanelTone } from "./ui/result-meta.js";

type CommandAction = ModalCommandAction;

export function App(): React.JSX.Element {
  const { exit } = useApp();
  const { columns } = useTerminalSize();
  const [state, setState] = useState<AppState>(createInitialAppState(DEFAULT_CONFIG));
  const [isLoading, setIsLoading] = useState(false);
  const generationInFlight = useRef(false);
  const abortController = useRef<AbortController | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    void bootstrapConfiguration(process.env)
      .then((result) => {
        const { config } = result;
        const bootstrapError = getBootstrapError(result);
        setConfig(config);
        setState((prev) => ({
          ...applyLoadedConfig(
            prev,
            config,
            bootstrapError ? describeUiError(bootstrapError, config.defaultProvider) : null,
          ),
        }));
      })
      .catch((error: unknown) => {
        setState((prev) => ({
          ...prev,
          error: describeUiError(error, prev.provider),
        }));
      })
      .finally(() => {
        setConfigReady(true);
      });
  }, []);

  const generate = useCallback(async () => {
    if (!canStartGeneration(state.input, generationInFlight.current)) return;
    generationInFlight.current = true;
    const controller = new AbortController();
    abortController.current = controller;
    setIsLoading(true);
    setState((prev) => beginGeneration(prev));

    try {
      const { result } = await executeReprompt({
        ...createUiRepromptInput(state, config, process.env),
        signal: controller.signal,
      });
      setState((prev) => completeGeneration(prev, result));
    } catch (err) {
      // An interrupt is a user decision, not a failure: leave the panel as it
      // was rather than showing an error the user just caused on purpose.
      if (!controller.signal.aborted) {
        setState((prev) => ({
          ...failGeneration(prev, describeUiError(err, state.provider)),
        }));
      }
    } finally {
      abortController.current = null;
      generationInFlight.current = false;
      setIsLoading(false);
    }
  }, [state, config]);

  const closeModal = (): void => {
    setState(closeModalState);
  };
  const setProfile = (profile: string): void => {
    setState((prev) => selectProfileState(prev, profile));
  };
  const setLevel = (level: RepromptLevel): void => {
    setState((prev) => selectLevelState(prev, level));
  };
  const setProvider = (provider: string): void => {
    const fallbackModel = getFallbackModelForProvider(provider);
    setState((prev) => selectProviderState(prev, provider, fallbackModel));
  };
  const setModel = (model: string): void => {
    setState((prev) => selectModelState(prev, model));
  };
  const updateInput = (input: string): void => {
    setState((prev) => updatePromptInput(prev, input));
  };
  const submitInput = (): void => {
    const outcome = resolveSubmit(state.input);
    if (outcome.type === "newline") {
      setState((prev) => updatePromptInput(prev, outcome.input));
      return;
    }
    void generate();
  };
  const clearCopied = (): void => {
    setState(clearCopyToast);
  };
  const copyResult = (dismissModal: boolean): void => {
    if (!state.result) return;
    void writeClipboard(state.result.rewritten)
      .then(() => {
        setState((prev) => completeCopy(prev, dismissModal));
        setTimeout(clearCopied, theme.behavior.toastDurationMs);
      })
      .catch((error: unknown) => {
        setState((prev) => failCopy(prev, describeUiError(error, state.provider)));
      });
  };
  const runCommand = (action: CommandAction): void => {
    const intent = resolveCommandIntent(action);
    switch (intent.type) {
      case "open-modal":
        setState((prev) => openModal(prev, intent.modal));
        return;
      case "generate":
        setState(closeModalState);
        void generate();
        return;
      case "copy":
        copyResult(true);
        return;
      case "show-view":
        setState((prev) => showView(prev, intent.view));
    }
  };

  // Keyboard shortcuts pin the current input: the TextInput value must survive
  // a state update triggered from outside the input itself.
  const pinInput = (patch: Partial<AppState>): void => {
    setState((prev) => pinInputState(prev, state.input, patch));
  };
  const toggleDiff = (): void => {
    setState((prev) => toggleDiffView(prev, state.input));
  };
  const runShortcut = (action: ShortcutAction): void => {
    const intent = resolveShortcutIntent(action);
    switch (intent.type) {
      case "close-modal":
        closeModal();
        return;
      case "exit":
        exit();
        return;
      case "cancel":
        abortController.current?.abort();
        return;
      case "generate":
        if (intent.preserveInput) {
          pinInput({});
        }
        void generate();
        return;
      case "copy":
        if (intent.preserveInput) {
          pinInput({});
        }
        copyResult(intent.dismissModal);
        return;
      case "toggle-diff":
        toggleDiff();
        return;
      case "show-view":
        pinInput({ view: intent.view });
        return;
      case "open-modal":
        pinInput({ modal: intent.modal });
    }
  };

  useInput((input, key) => {
    const action = resolveShortcut(
      input,
      { ctrl: key.ctrl, escape: key.escape },
      {
        hasModal: state.modal !== null,
        hasResult: state.result !== null,
        inputLength: state.input.length,
        isGenerating: isLoading,
      },
    );
    if (action) {
      runShortcut(action);
    }
  });

  const layoutMode = getLayoutMode(columns);
  const compact = layoutMode !== "wide";
  const resultTitle = getResultTitle(state.view);
  const frameWidth = getFrameWidth(columns);
  const headerStatus = getHeaderStatus({
    isLoading,
    hasError: state.error !== null,
    hasResult: state.result !== null,
  });
  const resultMeta = describeResultMeta(state.result, isLoading);
  const resultTone = getResultPanelTone({
    isLoading,
    hasError: state.error !== null,
    hasResult: state.result !== null,
  });

  if (!configReady) {
    return (
      <AppFrame mode={layoutMode} width={frameWidth}>
        <Box>
          <Text bold color={theme.color.accent}>
            reqraft
          </Text>
          <Text dimColor> chargement de la configuration...</Text>
        </Box>
      </AppFrame>
    );
  }

  if (state.modal) {
    return (
      <AppFrame mode={layoutMode} width={frameWidth}>
        <HeaderBar
          provider={state.provider}
          model={state.model}
          compact={compact}
          status={headerStatus}
        />
        <Panel title={getModalTitle(state.modal)} glyph={theme.symbol.caret} tone="primary">
          <AppModal
            modal={state.modal}
            provider={state.provider}
            profile={state.profile}
            level={state.level}
            model={state.model}
            hasResult={Boolean(state.result)}
            onSelectProfile={setProfile}
            onSelectLevel={setLevel}
            onSelectProvider={setProvider}
            onSelectModel={setModel}
            onRunCommand={runCommand}
            onClose={closeModal}
          />
        </Panel>
      </AppFrame>
    );
  }

  return (
    <AppFrame mode={layoutMode} width={frameWidth}>
      <HeaderBar
        provider={state.provider}
        model={state.model}
        compact={compact}
        status={headerStatus}
      />
      <Panel
        title="Prompt original"
        glyph={theme.symbol.caret}
        meta={describeInput(state.input)}
        tone="primary"
      >
        <PromptField
          value={state.input}
          onChange={updateInput}
          onSubmit={submitInput}
          focus={!isLoading}
          placeholder="Écris ta demande brute, même imparfaite…"
        />
      </Panel>
      <Box paddingX={1} marginBottom={theme.spacing.sm} flexWrap="wrap">
        <Badge label="Profil" value={state.profile} />
        <Badge label="Niveau" value={state.level} />
        {!compact && (
          <>
            <Badge label="Provider" value={state.provider} />
            <Badge label="Modèle" value={state.model} />
          </>
        )}
      </Box>
      <Panel title={resultTitle} glyph={theme.symbol.diamond} meta={resultMeta} tone={resultTone}>
        <ResultPanelBody
          isLoading={isLoading}
          error={state.error}
          result={state.result}
          view={state.view}
        />
      </Panel>
      <ShortcutBar compact={compact} hasResult={Boolean(state.result)} isGenerating={isLoading} />
      <Toast message={state.copied ? "Copié dans le presse-papiers." : null} />
    </AppFrame>
  );
}
