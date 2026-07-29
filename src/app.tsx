import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import process from "node:process";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { bootstrapConfiguration, getBootstrapError } from "./application/bootstrap.js";
import { executeReprompt } from "./application/reprompt.js";
import { writeClipboard } from "./clipboard/clipboard.js";
import { DEFAULT_CONFIG } from "./config/loader.js";
import type { Config } from "./config/schema.js";
import type { RepromptLevel, RepromptResult } from "./core/types.js";
import { getPresetModels } from "./models/presets.js";
import { listProfiles } from "./profiles/registry.js";
import { listProviders } from "./providers/registry.js";
import {
  AppFrame,
  EmptyState,
  HeaderBar,
  MetaRow,
  Notice,
  QualityNotice,
  SectionCard,
  ShortcutBar,
  Spinner,
  StatusBadge,
} from "./ui/components/index.js";
import { SelectModal, type SelectOption } from "./ui/components/select-modal.js";
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
import { resolveShortcut, type ShortcutAction } from "./ui/shortcuts.js";
import { theme } from "./ui/theme/tokens.js";

type ViewMode = "result" | "diff" | "explain";
type ModalType = "profile" | "level" | "provider" | "model" | "commands" | "help" | null;
type CommandAction =
  "generate" | "profile" | "level" | "provider" | "model" | "result" | "diff" | "explain" | "copy";

/** Panel titles per view. Lookup tables keep the render path free of ladders. */
const RESULT_TITLES: Record<ViewMode, string> = {
  result: "Prompt amélioré",
  diff: "Diff",
  explain: "Explication",
};

const EMPTY_STATE_TITLES: Record<ViewMode, string> = {
  result: "Aucun résultat pour le moment.",
  diff: "Le diff sera disponible après une génération.",
  explain: "L’explication sera disponible après une génération.",
};

const MODAL_TITLES: Record<NonNullable<ModalType>, string> = {
  help: "Aide",
  commands: "Palette d’actions",
  profile: "Sélection",
  level: "Sélection",
  provider: "Sélection",
  model: "Sélection",
};

interface AppState {
  input: string;
  profile: string;
  level: RepromptLevel;
  provider: string;
  model: string;
  result: RepromptResult | null;
  error: string | null;
  view: ViewMode;
  modal: ModalType;
  copied: boolean;
}

export function App(): React.JSX.Element {
  const { exit } = useApp();
  const { columns } = useTerminalSize();
  const [state, setState] = useState<AppState>({
    input: "",
    profile: DEFAULT_CONFIG.defaultProfile,
    level: DEFAULT_CONFIG.defaultLevel,
    provider: DEFAULT_CONFIG.defaultProvider,
    model: DEFAULT_CONFIG.defaultModel,
    result: null,
    error: null,
    view: "result",
    modal: null,
    copied: false,
  });
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
          ...prev,
          provider: config.defaultProvider,
          model: config.defaultModel,
          profile: config.defaultProfile,
          level: config.defaultLevel,
          error: bootstrapError
            ? formatUiError(bootstrapError, config.defaultProvider)
            : prev.error,
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
      const { result } = await executeReprompt({
        input: state.input,
        profileId: state.profile,
        level: state.level,
        providerId: state.provider,
        requestedModel: state.model,
        defaultModel: state.model,
        env: process.env,
        config: config ?? undefined,
        stream: false,
        fidelityMode: config?.fidelityMode,
        timeoutMs: config?.timeoutMs,
        maxOutputTokens: config?.maxOutputTokens,
      });
      setState((prev) => ({ ...prev, result, view: "result" }));
    } catch (err) {
      setState((prev) => ({
        ...failGeneration(prev, formatUiError(err, state.provider)),
      }));
    } finally {
      generationInFlight.current = false;
      setIsLoading(false);
    }
  }, [state.input, state.profile, state.level, state.provider, state.model, config]);

  const renderModal = (): React.JSX.Element | null => {
    switch (state.modal) {
      case "profile": {
        const profiles: SelectOption<string>[] = [
          { label: "auto (détection)", value: "auto" },
          ...listProfiles().map((p) => ({ label: `${p.name} — ${p.description}`, value: p.id })),
        ];
        return (
          <SelectModal
            title="Changer de profil"
            options={profiles}
            onSelect={setProfile}
            onCancel={closeModal}
          />
        );
      }
      case "level": {
        const levels: SelectOption<RepromptLevel>[] = [
          { label: "minimal", value: "minimal" },
          { label: "standard", value: "standard" },
          { label: "complete", value: "complete" },
        ];
        return (
          <SelectModal
            title="Changer de niveau"
            options={levels}
            onSelect={setLevel}
            onCancel={closeModal}
          />
        );
      }
      case "provider": {
        const providers: SelectOption<string>[] = listProviders().map((id) => ({
          label: id,
          value: id,
        }));
        return (
          <SelectModal
            title="Changer de provider"
            options={providers}
            onSelect={setProvider}
            onCancel={closeModal}
          />
        );
      }
      case "model": {
        const models: SelectOption<string>[] = getPresetModels()
          .filter((m) => m.provider === state.provider)
          .map((m) => ({ label: `${m.id} — ${m.name}`, value: m.id }));
        return (
          <SelectModal
            title="Changer de modèle"
            options={models}
            onSelect={setModel}
            onCancel={closeModal}
          />
        );
      }
      case "commands": {
        const actions: SelectOption<CommandAction>[] = [
          { label: "Générer ou régénérer", value: "generate" },
          { label: "Changer de profil", value: "profile" },
          { label: "Changer de niveau", value: "level" },
          { label: "Changer de provider", value: "provider" },
          { label: "Changer de modèle", value: "model" },
          ...(state.result
            ? [
                { label: "Afficher le résultat", value: "result" as const },
                { label: "Afficher le diff", value: "diff" as const },
                { label: "Afficher l'explication", value: "explain" as const },
                { label: "Copier le résultat", value: "copy" as const },
              ]
            : []),
        ];
        return (
          <SelectModal
            title="Actions"
            options={actions}
            onSelect={runCommand}
            onCancel={closeModal}
          />
        );
      }
      case "help":
        return (
          <SelectModal
            title="Raccourcis"
            options={[
              { label: "Entrée — générer", value: "generate" },
              { label: "Ctrl+P — profil", value: "profile" },
              { label: "Ctrl+L — niveau", value: "level" },
              { label: "Ctrl+M — modèle", value: "model" },
              { label: "Ctrl+D — diff", value: "diff" },
              { label: "Ctrl+R — régénérer", value: "regenerate" },
            ]}
            onSelect={closeModal}
            onCancel={closeModal}
          />
        );
      default:
        return null;
    }
  };

  const closeModal = (): void => {
    setState((prev) => ({ ...prev, modal: null }));
  };
  const setProfile = (profile: string): void => {
    setState((prev) => ({ ...prev, profile, modal: null }));
  };
  const setLevel = (level: RepromptLevel): void => {
    setState((prev) => ({ ...prev, level, modal: null }));
  };
  const setProvider = (provider: string): void => {
    const fallbackModel =
      getPresetModels().find((preset) => preset.provider === provider)?.id ?? "";
    setState((prev) => ({ ...prev, provider, model: fallbackModel, modal: null }));
  };
  const setModel = (model: string): void => {
    setState((prev) => ({ ...prev, model, modal: null }));
  };
  const updateInput = (input: string): void => {
    setState((prev) => ({ ...prev, input }));
  };
  const submitInput = (): void => {
    void generate();
  };
  const clearCopied = (): void => {
    setState((prev) => ({ ...prev, copied: false }));
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
      setState((prev) => ({ ...prev, modal: action as ModalType }));
      return;
    }
    if (action === "generate") {
      setState((prev) => ({ ...prev, modal: null }));
      void generate();
      return;
    }
    if (action === "copy") {
      copyResult(true);
      return;
    }
    setState((prev) => ({ ...prev, view: action as ViewMode, modal: null }));
  };

  // Keyboard shortcuts pin the current input: the TextInput value must survive
  // a state update triggered from outside the input itself.
  const pinInput = (patch: Partial<AppState>): void => {
    setState((prev) => ({ ...prev, input: state.input, ...patch }));
  };
  const toggleDiff = (): void => {
    setState((prev) => ({
      ...prev,
      input: state.input,
      view: prev.view === "diff" ? "result" : "diff",
    }));
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

  const renderResult = (): string => {
    if (!state.result) return "";
    switch (state.view) {
      case "diff":
        return formatDiff(state.result.original, state.result.rewritten);
      case "explain":
        return formatExplain(state.result);
      case "result":
      default:
        return state.result.rewritten;
    }
  };

  const resultText = renderResult();
  const layoutMode = getLayoutMode(columns);
  const compact = layoutMode !== "wide";
  const resultTitle = RESULT_TITLES[state.view];
  const frameWidth = getFrameWidth(columns);

  const renderResultBody = (): React.JSX.Element => {
    if (isLoading) {
      return <Spinner />;
    }
    if (state.error) {
      return <Notice tone="danger">{state.error}</Notice>;
    }
    if (state.result) {
      return (
        <>
          <Text wrap="wrap">{resultText}</Text>
          <MetaRow result={state.result} />
          <QualityNotice quality={state.result.quality} />
        </>
      );
    }
    return (
      <EmptyState
        title={EMPTY_STATE_TITLES[state.view]}
        action="Appuie sur Entrée pour générer une reformulation."
      />
    );
  };

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
        <SectionCard title={MODAL_TITLES[state.modal]} tone="primary">
          {renderModal()}
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
        {renderResultBody()}
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

function formatDiff(original: string, rewritten: string): string {
  const originalLines = original.split("\n");
  const rewrittenLines = rewritten.split("\n");
  const output: string[] = [];
  const maxLines = Math.max(originalLines.length, rewrittenLines.length);

  for (let i = 0; i < maxLines; i++) {
    const originalLine = originalLines[i] ?? "";
    const rewrittenLine = rewrittenLines[i] ?? "";
    if (originalLine !== rewrittenLine) {
      output.push(`- ${originalLine}`);
      output.push(`+ ${rewrittenLine}`);
    } else {
      output.push(`  ${originalLine}`);
    }
  }

  return output.join("\n");
}

function formatExplain(result: RepromptResult): string {
  const lines = ["Modifications :"];
  for (const change of result.changes) {
    lines.push(`- ${change}`);
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Avertissements :");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join("\n");
}
