import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import process from "node:process";
import { rewrite } from "./core/engine.js";

import type { RepromptLevel, RepromptResult } from "./core/types.js";
import { loadConfig } from "./config/loader.js";
import { resolveProfile, listProfiles } from "./profiles/registry.js";
import { createProvider, listProviders } from "./providers/registry.js";
import { resolveModel } from "./models/model-resolver.js";
import { getPresetModels } from "./models/presets.js";
import { writeClipboard } from "./clipboard/clipboard.js";
import { useTerminalSize } from "./ui/hooks/use-terminal-size.js";
import { SelectModal, type SelectOption } from "./ui/components/select-modal.js";

type ViewMode = "result" | "diff" | "explain";
type ModalType = "profile" | "level" | "provider" | "model" | null;

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
  const { columns, rows } = useTerminalSize();
  const [state, setState] = useState<AppState>({
    input: "",
    profile: "auto",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    result: null,
    error: null,
    view: "result",
    modal: null,
    copied: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadConfig()
      .then((config) => {
        setState((prev) => ({
          ...prev,
          provider: config.defaultProvider,
          model: config.defaultModel,
          profile: config.defaultProfile,
          level: config.defaultLevel,
        }));
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  const generate = useCallback(async () => {
    if (!state.input.trim()) return;
    setIsLoading(true);
    setState((prev) => ({ ...prev, error: null, result: null }));

    try {
      const { profile } = resolveProfile(state.profile, state.input);
      const provider = createProvider(state.provider as "mock", process.env);
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
      });
      setState((prev) => ({ ...prev, result, view: "result" }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setIsLoading(false);
    }
  }, [state.input, state.profile, state.level, state.provider, state.model]);

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
    if (key.ctrl && key.shift && input === "C") {
      if (state.result) {
        void writeClipboard(state.result.rewritten).then(() => {
          setState((prev) => ({ ...prev, copied: true }));
          setTimeout(() => {
            setState((prev) => ({ ...prev, copied: false }));
          }, 1500);
        });
      }
      return;
    }
    if (key.ctrl && input === "d") {
      setState((prev) => ({ ...prev, view: prev.view === "diff" ? "result" : "diff" }));
      return;
    }
    if (key.ctrl && input === "p") {
      setState((prev) => ({ ...prev, modal: "profile" }));
      return;
    }
    if (key.ctrl && input === "m") {
      setState((prev) => ({ ...prev, modal: "model" }));
      return;
    }
    if (key.ctrl && input === "l") {
      setState((prev) => ({ ...prev, modal: "level" }));
      return;
    }
    if (key.ctrl && input === "r") {
      void generate();
      return;
    }
    if (input === "?") {
      setState((prev) => ({ ...prev, view: prev.view === "explain" ? "result" : "explain" }));
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
        const providers: SelectOption<string>[] = listProviders().map((id) => ({ label: id, value: id }));
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
    setState((prev) => ({ ...prev, provider, modal: null }));
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
  const maxHeight = Math.max(3, Math.floor(rows / 3));

  return (
    <Box flexDirection="column" height={rows}>
      <Box justifyContent="space-between">
        <Text bold>rp</Text>
        <Text>{state.provider} · {state.model}</Text>
      </Box>

      <Box flexDirection="column" borderStyle="single" padding={1} minHeight={3}>
        <Text dimColor>Prompt original</Text>
        <TextInput
          value={state.input}
          onChange={updateInput}
          onSubmit={submitInput}
          placeholder="Écris ta demande brute..."
        />
      </Box>

      <Box justifyContent="space-between" paddingX={1}>
        <Text>Profil : {state.profile}</Text>
        <Text>Niveau : {state.level}</Text>
      </Box>

      <Box flexDirection="column" borderStyle="single" padding={1} flexGrow={1} minHeight={maxHeight}>
        <Text dimColor>
          {state.view === "result" && "Prompt amélioré"}
          {state.view === "diff" && "Diff"}
          {state.view === "explain" && "Explication"}
        </Text>
        {isLoading ? (
          <Text>Génération...</Text>
        ) : state.error ? (
          <Text color="red">{state.error}</Text>
        ) : (
          <Text wrap="wrap">{resultText || "Appuie sur Ctrl+Enter pour générer."}</Text>
        )}
      </Box>

      <Box justifyContent="space-between" paddingX={1}>
        <Text dimColor>
          Ctrl+Enter générer · Ctrl+P profil · Ctrl+L niveau · Ctrl+M modèle · Ctrl+D diff · Ctrl+R régénérer · ? explication · Esc quitter
        </Text>
      </Box>

      {state.copied && (
        <Box>
          <Text color="green">Copié dans le presse-papiers.</Text>
        </Box>
      )}

      {state.modal && (
        <Box position="absolute" marginTop={Math.floor(rows / 4)} marginLeft={Math.floor(columns / 4)}>
          {renderModal()}
        </Box>
      )}
    </Box>
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
