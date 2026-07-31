import { Box, Text, render, useApp, useFocusManager, useInput, useStdout } from "ink";
import React, { useEffect, useMemo } from "react";

import { Alert } from "@/components/ui/alert.js";
import { Badge } from "@/components/ui/badge.js";
import { Card } from "@/components/ui/card.js";
import { ModelSelector } from "@/components/ui/model-selector.js";
import { Select } from "@/components/ui/select.js";
import { Spinner } from "@/components/ui/spinner.js";
import { TextArea } from "@/components/ui/text-area.js";
import { ThemeProvider } from "@/components/ui/theme-provider.js";
import {
  LEVEL_OPTIONS,
  MODEL_OPTIONS,
  PROFILE_OPTIONS,
  PROVIDER_OPTIONS,
  useTuiController,
} from "./controller.js";
import type {
  OverlayId,
  ProfileId,
  ProviderId,
  RepromptLevel,
  TuiStatus,
} from "./types.js";

const SHORTCUTS = [
  "^G Générer",
  "^P Profil",
  "^L Niveau",
  "^I Provider",
  "^O Modèle",
  "^E Erreur",
  "^R Reset",
  "^Y Copier",
  "Tab Focus",
  "? Aide",
];

function App(): React.JSX.Element {
  const controller = useTuiController();
  const { state } = controller;
  const { exit } = useApp();
  const focusManager = useFocusManager();
  const { stdout } = useStdout();
  const [columns, rows] = [stdout.columns, stdout.rows];

  // Restore editor focus when closing overlay or changing focus target.
  useEffect(() => {
    if (state.activeOverlay) {
      focusManager.focus("result");
      return;
    }
    focusManager.focus(state.focusedElement);
  }, [state.activeOverlay, state.focusedElement, focusManager]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (state.activeOverlay) {
      if (key.escape) {
        controller.setOverlay(null);
      }
      return;
    }

    if (key.escape) {
      exit();
      return;
    }

    if (key.tab) {
      controller.setFocus(state.focusedElement === "editor" ? "result" : "editor");
      return;
    }

    if (key.ctrl && input === "g") {
      void controller.generate(state.input);
      return;
    }
    if (key.ctrl && input === "p") {
      controller.setOverlay("profile");
      return;
    }
    if (key.ctrl && input === "l") {
      controller.setOverlay("level");
      return;
    }
    if (key.ctrl && input === "i") {
      controller.setOverlay("provider");
      return;
    }
    if (key.ctrl && input === "o") {
      controller.setOverlay("model");
      return;
    }
    if (key.ctrl && input === "e") {
      controller.simulateError();
      return;
    }
    if (key.ctrl && input === "r") {
      controller.resetResult();
      return;
    }
    if (key.ctrl && input === "y") {
      void controller.copyResult();
      return;
    }
    if (input === "?") {
      controller.setOverlay("help");
    }
  });

  const modelOptions = useMemo(
    () =>
      MODEL_OPTIONS[state.provider].map((option) => ({
        id: option.value,
        name: option.label,
        provider: state.provider,
      })),
    [state.provider],
  );

  const editorRows = Math.max(6, Math.floor((rows - 18) / 2));
  const resultRows = Math.max(8, rows - editorRows - 14);

  return (
    <Box flexDirection="column" height={rows} paddingX={1} paddingY={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold color="magenta">
          reqraft
        </Text>
        <Text dimColor>
          {state.provider} / {state.model} / {state.status} / {columns} cols
        </Text>
      </Box>

      <Card
        title="Prompt original"
        subtitle={describeInput(state.input)}
        borderStyle={state.focusedElement === "editor" ? "double" : "round"}
        borderColor={state.focusedElement === "editor" ? "#8B5CF6" : undefined}
        width={columns - 2}
        paddingX={1}
        paddingY={1}
      >
        <TextArea
          id="editor"
          value={state.input}
          onChange={controller.setInput}
          onSubmit={(value: string) => void controller.generate(value)}
          rows={editorRows}
          placeholder="Tape ta demande brute ici…"
          borderStyle={false}
          paddingX={0}
        />
      </Card>

      <Box flexDirection="row" gap={1} marginY={1} flexWrap="wrap">
        <Badge variant="secondary">{`profil: ${state.profile}`}</Badge>
        <Badge variant="secondary">{`niveau: ${state.level}`}</Badge>
        <Badge variant="secondary">{`provider: ${state.provider}`}</Badge>
        <Badge variant="secondary">{`modèle: ${shortModel(state.model)}`}</Badge>
      </Box>

      <Card
        title={resultTitle(state.status, state.result)}
        subtitle={resultMeta(state)}
        borderStyle={state.focusedElement === "result" ? "double" : "round"}
        borderColor={state.focusedElement === "result" ? "#8B5CF6" : resultBorderColor(state.status)}
        width={columns - 2}
        paddingX={1}
        paddingY={1}
      >
        <ResultBody
          result={state.result}
          warning={state.warning}
          error={state.error}
          status={state.status}
          rows={resultRows}
          width={columns - 4}
        />
      </Card>

      <Box marginTop={1}>
        <Text dimColor>{SHORTCUTS.join("  ·  ")}</Text>
      </Box>

      {state.copied && (
        <Box position="absolute" marginRight={2} marginBottom={1}>
          <Badge variant="success">Résultat copié (mock)</Badge>
        </Box>
      )}

      <Overlay
        overlay={state.activeOverlay}
        state={state}
        controller={controller}
        modelOptions={modelOptions}
        width={columns - 2}
      />
    </Box>
  );
}

function ResultBody({
  result,
  warning,
  error,
  status,
  rows,
  width,
}: {
  result: string;
  warning?: string;
  error?: string;
  status: TuiStatus;
  rows: number;
  width: number;
}): React.JSX.Element {
  if (error && !result) {
    return (
      <Alert variant="error" title="Provider mock indisponible" bordered={false}>
        <Text>{error}</Text>
        <Text dimColor>Ctrl+E revient à l’état précédent. Ctrl+G relance.</Text>
      </Alert>
    );
  }

  if (!result && status === "idle") {
    return (
      <Box height={rows} flexDirection="column" alignItems="center" justifyContent="center">
        <Text dimColor>Aucun résultat pour le moment.</Text>
        <Text dimColor>Appuie sur Ctrl+G pour lancer le faux streaming.</Text>
      </Box>
    );
  }

  if (!result && status === "loading") {
    return (
      <Box height={rows} flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
        <Spinner label="Préparation de la génération mock…" />
        <Text dimColor>Le premier delta arrive dans un instant.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {error && (
        <Alert variant="error" title="Erreur" bordered={false}>
          {error} Ctrl+E revient au résultat.
        </Alert>
      )}
      {!error && warning && (
        <Alert variant="warning" title="Attention" bordered={false}>
          {warning}
        </Alert>
      )}
      <Box flexDirection="column" height={rows} width={width} overflow="hidden">
        {wrapLines(result, width).map((line, index) => (
          <Text key={`${index}-${line}`}>{line || " "}</Text>
        ))}
      </Box>
    </Box>
  );
}

function Overlay({
  overlay,
  state,
  controller,
  modelOptions,
  width,
}: {
  overlay: OverlayId;
  state: ReturnType<typeof useTuiController>["state"];
  controller: ReturnType<typeof useTuiController>;
  modelOptions: { id: string; name: string; provider: string }[];
  width: number;
}): React.JSX.Element | null {
  if (!overlay) return null;

  return (
    <Box
      position="absolute"
      marginTop={6}
      marginLeft={4}
      width={Math.min(74, width - 4)}
      borderStyle="double"
      borderColor="#8B5CF6"
      paddingX={1}
      paddingY={1}
      flexDirection="column"
      gap={1}
    >
      {overlay === "help" ? (
        <HelpOverlay />
      ) : overlay === "model" ? (
        <>
          <Text bold color="#8B5CF6">
            Changer de modèle
          </Text>
          <ModelSelector
            models={modelOptions}
            selected={state.model}
            onSelect={(id: string) => controller.setModel(id)}
            groupByProvider
          />
        </>
      ) : (
        <>
          <Text bold color="#8B5CF6">
            {pickerTitle(overlay)}
          </Text>
          <Select
            options={optionsForOverlay(overlay, state.provider)}
            value={currentValueForOverlay(overlay, state)}
            onSubmit={(value: string) => selectOverlayValue(controller, overlay, value)}
          />
        </>
      )}
      <Text dimColor>Esc fermer · Entrée choisir</Text>
    </Box>
  );
}

function HelpOverlay(): React.JSX.Element {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Aide du POC Termcn</Text>
      <Text dimColor>
        Ce POC ne contacte aucun provider. Il valide renderer, clavier, textarea, pickers et états.
      </Text>
      <Text>Ctrl+G lance un faux streaming. Ctrl+E bascule l’erreur. Tab change le focus.</Text>
      <Text>Les pickers s’ouvrent avec les raccourcis des badges. Esc ferme cette aide.</Text>
    </Box>
  );
}

function optionsForOverlay(overlay: Exclude<OverlayId, null | "help" | "model">, provider: ProviderId) {
  if (overlay === "profile") return PROFILE_OPTIONS.map((o) => ({ label: o.label, value: o.value, hint: o.description }));
  if (overlay === "level") return LEVEL_OPTIONS.map((o) => ({ label: o.label, value: o.value, hint: o.description }));
  if (overlay === "provider") return PROVIDER_OPTIONS.map((o) => ({ label: o.label, value: o.value, hint: o.description }));
  return MODEL_OPTIONS[provider].map((o) => ({ label: o.label, value: o.value, hint: o.description }));
}

function currentValueForOverlay(
  overlay: Exclude<OverlayId, null | "help" | "model">,
  state: ReturnType<typeof useTuiController>["state"],
) {
  if (overlay === "profile") return state.profile;
  if (overlay === "level") return state.level;
  if (overlay === "provider") return state.provider;
  return state.model;
}

function pickerTitle(overlay: Exclude<OverlayId, null | "help" | "model">) {
  if (overlay === "profile") return "Changer de profil";
  if (overlay === "level") return "Changer de niveau";
  if (overlay === "provider") return "Changer de provider";
  return "Changer de modèle";
}

function selectOverlayValue(
  controller: ReturnType<typeof useTuiController>,
  overlay: Exclude<OverlayId, null | "help" | "model">,
  value: string,
): void {
  if (overlay === "profile") controller.setProfile(value as ProfileId);
  if (overlay === "level") controller.setLevel(value as RepromptLevel);
  if (overlay === "provider") controller.setProvider(value as ProviderId);
}

function resultTitle(status: TuiStatus, result: string): string {
  if (status === "error" && !result) return "Erreur";
  if (status === "loading" || status === "streaming") return "Génération";
  return "Prompt amélioré";
}

function resultMeta(state: ReturnType<typeof useTuiController>["state"]): string {
  if (state.status === "idle") return "en attente";
  return `${(state.stats.elapsedMs / 1000).toFixed(1)} s · ${state.stats.inputTokens} entrée · ${state.stats.outputTokens} sortie`;
}

function resultBorderColor(status: TuiStatus): string | undefined {
  if (status === "error") return "#EF4444";
  if (status === "success") return "#10B981";
  return undefined;
}

function describeInput(input: string): string {
  const lines = input.length === 0 ? 0 : input.split("\n").length;
  const words = input.trim() ? input.trim().split(/\s+/).length : 0;
  return `${lines} ligne${lines > 1 ? "s" : ""} · ${words} mot${words > 1 ? "s" : ""}`;
}

function shortModel(model: string): string {
  return model.length > 14 ? `${model.slice(0, 11)}…` : model;
}

function wrapLines(text: string, width: number): string[] {
  const safeWidth = Math.max(8, width);
  return text.split("\n").flatMap((line) => wrapLine(line, safeWidth));
}

function wrapLine(line: string, width: number): string[] {
  if (!line) return [""];
  const chunks: string[] = [];
  let current = line;
  while (current.length > width) {
    const slice = current.slice(0, width + 1);
    const breakAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\t"));
    const end = breakAt > 4 ? breakAt : width;
    chunks.push(current.slice(0, end).trimEnd());
    current = current.slice(end).trimStart();
  }
  chunks.push(current);
  return chunks;
}

function Root(): React.JSX.Element {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

Root.displayName = "Root";

render(<Root />);
