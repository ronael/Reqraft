import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
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
  type ModalType,
  type ViewMode,
} from "./ui/app-state.js";
import {
  AppFrame,
  AppModal,
  HeaderBar,
  Notice,
  ResultPanelBody,
  SectionCard,
  ShortcutBar,
  StatusBadge,
} from "./ui/components/index.js";
import { formatUiError } from "./ui/errors.js";
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
import { theme } from "./ui/theme/tokens.js";
import { getModalTitle, getResultTitle } from "./ui/view-labels.js";

type CommandAction = ModalCommandAction;

export function App(): React.JSX.Element {
  const { exit } = useApp();
  const { columns } = useTerminalSize();
  const [state, setState] = useState<AppState>(createInitialAppState(DEFAULT_CONFIG));
  const [isLoading, setIsLoading] = useState(false);
  const generationInFlight = useRef(false);
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
            bootstrapError ? formatUiError(bootstrapError, config.defaultProvider) : null,
          ),
        }));
      })
      .catch((error: unknown) => {
        setState((prev) => ({
          ...prev,
          error: formatUiError(error, prev.provider),
        }));
      })
      .finally(() => {
        setConfigReady(true);
      });
  }, []);

  const generate = useCallback(async () => {
    if (!canStartGeneration(state.input, generationInFlight.current)) return;
    generationInFlight.current = true;
    setIsLoading(true);
    setState((prev) => beginGeneration(prev));

    try {
      const { result } = await executeReprompt(createUiRepromptInput(state, config, process.env));
      setState((prev) => completeGeneration(prev, result));
    } catch (err) {
      setState((prev) => ({
        ...failGeneration(prev, formatUiError(err, state.provider)),
      }));
    } finally {
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
        setState((prev) => failCopy(prev, formatUiError(error, state.provider)));
      });
  };
  const runCommand = (action: CommandAction): void => {
    if (["profile", "level", "provider", "model"].includes(action)) {
      setState((prev) => openModal(prev, action as NonNullable<ModalType>));
      return;
    }
    if (action === "generate") {
      setState(closeModalState);
      void generate();
      return;
    }
    if (action === "copy") {
      copyResult(true);
      return;
    }
    setState((prev) => showView(prev, action as ViewMode));
  };

  // Keyboard shortcuts pin the current input: the TextInput value must survive
  // a state update triggered from outside the input itself.
  const pinInput = (patch: Partial<AppState>): void => {
    setState((prev) => pinInputState(prev, state.input, patch));
  };
  const toggleDiff = (): void => {
    setState((prev) => toggleDiffView(prev, state.input));
  };

  const shortcutHandlers: Record<ShortcutAction, () => void> = {
    "close-modal": closeModal,
    exit,
    generate: submitInput,
    regenerate: () => {
      pinInput({});
      void generate();
    },
    copy: () => {
      pinInput({});
      copyResult(false);
    },
    "toggle-diff": toggleDiff,
    "show-explain": () => {
      pinInput({ view: "explain" });
    },
    "open-profile": () => {
      pinInput({ modal: "profile" });
    },
    "open-level": () => {
      pinInput({ modal: "level" });
    },
    "open-model": () => {
      pinInput({ modal: "model" });
    },
    "open-commands": () => {
      pinInput({ modal: "commands" });
    },
    "open-help": () => {
      pinInput({ modal: "help" });
    },
  };

  useInput((input, key) => {
    const action = resolveShortcut(
      input,
      { ctrl: key.ctrl, escape: key.escape },
      {
        hasModal: state.modal !== null,
        hasResult: state.result !== null,
        inputLength: state.input.length,
      },
    );
    if (action) {
      shortcutHandlers[action]();
    }
  });

  const layoutMode = getLayoutMode(columns);
  const compact = layoutMode !== "wide";
  const resultTitle = getResultTitle(state.view);
  const frameWidth = getFrameWidth(columns);

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
        <HeaderBar provider={state.provider} model={state.model} compact={compact} />
        <SectionCard title={getModalTitle(state.modal)} tone="primary">
          <AppModal
            modal={state.modal}
            provider={state.provider}
            hasResult={Boolean(state.result)}
            onSelectProfile={setProfile}
            onSelectLevel={setLevel}
            onSelectProvider={setProvider}
            onSelectModel={setModel}
            onRunCommand={runCommand}
            onClose={closeModal}
          />
        </SectionCard>
      </AppFrame>
    );
  }

  return (
    <AppFrame mode={layoutMode} width={frameWidth}>
      <HeaderBar provider={state.provider} model={state.model} compact={compact} />
      <SectionCard title="Demande brute" tone="primary">
        <TextInput
          value={state.input}
          onChange={updateInput}
          onSubmit={submitInput}
          focus={!isLoading}
          placeholder="Écris ta demande brute, même imparfaite…"
        />
      </SectionCard>
      <Box paddingX={1} marginBottom={1} flexWrap="wrap">
        <StatusBadge label="Profil" value={state.profile} />
        <StatusBadge label="Niveau" value={state.level} />
        {!compact && (
          <>
            <StatusBadge label="Provider" value={state.provider} />
            <StatusBadge label="Modèle" value={state.model} />
          </>
        )}
      </Box>
      <SectionCard title={resultTitle} tone={state.result ? "primary" : "secondary"}>
        <ResultPanelBody
          isLoading={isLoading}
          error={state.error}
          result={state.result}
          view={state.view}
        />
      </SectionCard>
      <ShortcutBar compact={compact} hasResult={Boolean(state.result)} />

      {state.copied && (
        <Box>
          <Notice tone="success">Copié dans le presse-papiers.</Notice>
        </Box>
      )}
    </AppFrame>
  );
}
