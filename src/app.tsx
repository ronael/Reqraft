import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import process from "node:process";
import { rewrite } from "./core/engine.js";

import type { RepromptLevel, RepromptResult } from "./core/types.js";
import type { Config } from "./config/schema.js";
import { DEFAULT_CONFIG, loadConfig } from "./config/loader.js";
import { resolveProfile, listProfiles } from "./profiles/registry.js";
import { createProvider, listProviders } from "./providers/registry.js";
import { resolveModel } from "./models/model-resolver.js";
import { getPresetModels } from "./models/presets.js";
import { writeClipboard } from "./clipboard/clipboard.js";
import { useTerminalSize } from "./ui/hooks/use-terminal-size.js";
import { SelectModal, type SelectOption } from "./ui/components/select-modal.js";
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
import { hydrateCredentials } from "./auth/credentials.js";
import { formatUiError } from "./ui/errors.js";
import { getFrameWidth, getLayoutMode } from "./ui/layout/responsive.js";
import { theme } from "./ui/theme/tokens.js";

type ViewMode = "result" | "diff" | "explain";
type ModalType = "profile" | "level" | "provider" | "model" | "commands" | "help" | null;
type CommandAction =
  "generate" | "profile" | "level" | "provider" | "model" | "result" | "diff" | "explain" | "copy";

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
  const [config, setConfig] = useState<Config | null>(null);
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    hydrateCredentials(process.env)
      .catch(() => undefined)
      .then(() => loadConfig())
      .then((config) => {
        setConfig(config);
        setState((prev) => ({
          ...prev,
          provider: config.defaultProvider,
          model: config.defaultModel,
          profile: config.defaultProfile,
          level: config.defaultLevel,
        }));
      })
      .catch(() => {
        // Keep the validated defaults if the local file cannot be loaded.
      })
      .finally(() => {
        setConfigReady(true);
      });
  }, []);

  const generate = useCallback(async () => {
    if (!state.input.trim()) return;
    setIsLoading(true);
    setState((prev) => ({ ...prev, error: null, result: null }));

    try {
      await hydrateCredentials(process.env);
      const { profile } = resolveProfile(state.profile, state.input);
      const provider = createProvider(state.provider as "mock", process.env, config ?? undefined);
      const { model, reasoningEffort } = resolveModel(state.provider, state.model, state.model);
      const result = await rewrite({
        input: state.input,
        profile,
        level: state.level,
        provider,
        model,
        includeChanges: true,
        stream: false,
        reasoningEffort,
        fidelityMode: config?.fidelityMode,
        timeoutMs: config?.timeoutMs,
        maxOutputTokens: config?.maxOutputTokens,
      });
      setState((prev) => ({ ...prev, result, view: "result" }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: formatUiError(err, state.provider),
      }));
    } finally {
      setIsLoading(false);
    }
  }, [state.input, state.profile, state.level, state.provider, state.model, config]);

  useInput((input, key) => {
    if (state.modal) {
      if (key.escape) {
        setState((prev) => ({ ...prev, modal: null }));
      }
      return;
    }

    if (key.ctrl && input === "\r") {
      void generate();
      return;
    }
    if (key.ctrl && input === "y") {
      setState((prev) => ({ ...prev, input: state.input }));
      if (state.result) {
        void writeClipboard(state.result.rewritten).then(() => {
          setState((prev) => ({ ...prev, copied: true }));
          setTimeout(() => {
            setState((prev) => ({ ...prev, copied: false }));
          }, theme.behavior.toastDurationMs);
        });
      }
      return;
    }
    if (key.ctrl && input === "d") {
      setState((prev) => ({
        ...prev,
        input: state.input,
        view: prev.view === "diff" ? "result" : "diff",
      }));
      return;
    }
    if (key.ctrl && input === "p") {
      setState((prev) => ({ ...prev, input: state.input, modal: "profile" }));
      return;
    }
    if (key.ctrl && input === "m") {
      setState((prev) => ({ ...prev, input: state.input, modal: "model" }));
      return;
    }
    if (key.ctrl && input === "l") {
      setState((prev) => ({ ...prev, input: state.input, modal: "level" }));
      return;
    }
    if (key.ctrl && input === "r") {
      setState((prev) => ({ ...prev, input: state.input }));
      void generate();
      return;
    }
    if (key.ctrl && input === "k") {
      setState((prev) => ({ ...prev, input: state.input, modal: "commands" }));
      return;
    }
    if (key.ctrl && input === "e" && state.result) {
      setState((prev) => ({ ...prev, input: state.input, view: "explain" }));
      return;
    }
    if (input === "?" && state.input.length === 0) {
      setState((prev) => ({ ...prev, input: state.input, modal: "help" }));
      return;
    }
    if (key.escape || (key.ctrl && input === "c")) {
      exit();
    }
  });

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
  const copyResult = (): void => {
    if (!state.result) return;
    void writeClipboard(state.result.rewritten).then(() => {
      setState((prev) => ({ ...prev, copied: true, modal: null }));
      setTimeout(() => {
        setState((prev) => ({ ...prev, copied: false }));
      }, theme.behavior.toastDurationMs);
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
      copyResult();
      return;
    }
    setState((prev) => ({ ...prev, view: action as ViewMode, modal: null }));
  };

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
  const resultTitle =
    state.view === "diff" ? "Diff" : state.view === "explain" ? "Explication" : "Prompt amélioré";
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
        <SectionCard
          title={
            state.modal === "help"
              ? "Aide"
              : state.modal === "commands"
                ? "Palette d’actions"
                : "Sélection"
          }
          tone="primary"
        >
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
        {isLoading ? (
          <Spinner />
        ) : state.error ? (
          <Notice tone="danger">{state.error}</Notice>
        ) : state.result ? (
          <>
            <Text wrap="wrap">{resultText}</Text>
            <MetaRow result={state.result} />
            <QualityNotice quality={state.result.quality} />
          </>
        ) : (
          <EmptyState
            title={
              state.view === "diff"
                ? "Le diff sera disponible après une génération."
                : state.view === "explain"
                  ? "L’explication sera disponible après une génération."
                  : "Aucun résultat pour le moment."
            }
            action="Appuie sur Entrée pour générer une reformulation."
          />
        )}
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
