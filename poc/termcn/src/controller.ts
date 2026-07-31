import { useCallback, useRef, useState } from "react";
import type {
  Option,
  ProfileId,
  ProviderId,
  RepromptLevel,
  TuiController,
  TuiState,
} from "./types.js";

export const PROFILE_OPTIONS: Option<ProfileId>[] = [
  { label: "auto", value: "auto", description: "Détection locale du profil adapté." },
  { label: "clean", value: "clean", description: "Correction et clarification légère." },
  { label: "code", value: "code", description: "Demandes pour agents de développement." },
  { label: "frontend", value: "frontend", description: "Implémentation frontend." },
  { label: "web-design", value: "web-design", description: "Interfaces et landing pages." },
  { label: "debug", value: "debug", description: "Bugs et erreurs." },
  { label: "review", value: "review", description: "Audit et revue de code." },
  { label: "writing", value: "writing", description: "Messages, e-mails et documents." },
];

export const LEVEL_OPTIONS: Option<RepromptLevel>[] = [
  { label: "minimal", value: "minimal", description: "Retouche légère." },
  { label: "standard", value: "standard", description: "Brief clair et actionnable." },
  { label: "complete", value: "complete", description: "Structuration détaillée." },
];

export const PROVIDER_OPTIONS: Option<ProviderId>[] = [
  { label: "OpenAI", value: "openai", description: "Référence rapide." },
  { label: "Anthropic", value: "anthropic", description: "Alternative qualitative." },
  { label: "Mistral", value: "mistral", description: "Provider européen." },
  { label: "DeepSeek", value: "deepseek", description: "Option économique." },
];

export const MODEL_OPTIONS: Record<ProviderId, Option<string>[]> = {
  openai: [
    { label: "gpt-4.1-mini", value: "gpt-4.1-mini", description: "Rapide, référence Reqraft." },
    { label: "gpt-5-mini", value: "gpt-5-mini", description: "Raisonnement compact." },
    { label: "gpt-5.1", value: "gpt-5.1", description: "Qualité haute." },
  ],
  anthropic: [
    { label: "claude-haiku-4-5", value: "claude-haiku-4-5", description: "Très rapide." },
    { label: "claude-sonnet-5", value: "claude-sonnet-5", description: "Plus complet." },
  ],
  mistral: [
    { label: "mistral-small-2603", value: "mistral-small-2603", description: "Bon quotidien." },
  ],
  deepseek: [
    { label: "deepseek-v4-flash", value: "deepseek-v4-flash", description: "Rapide." },
    { label: "deepseek-v4-pro", value: "deepseek-v4-pro", description: "Plus précis." },
  ],
};

const DEFAULT_INPUT =
  "Je veux créer une landing page premium pour Reqraft, claire, élégante et utilisable par une IA de code.";

const MOCK_DELTAS = [
  "Crée une landing page premium pour Reqraft.\n\n",
  "Objectif : présenter un CLI de reformulation de prompts pour agents IA.\n\n",
  "Structure attendue :\n",
  "- hero sobre avec le nom Reqraft visible dès le premier écran ;\n",
  "- bénéfices concrets : clarté, fidélité, vitesse ;\n",
  "- section montrant un prompt brut puis sa version améliorée ;\n",
  "- preuves de qualité : providers, profils, stats et garde-fous ;\n",
  "- appel à l’action pour installer et tester le CLI.\n\n",
  "Contraintes : style inspiré Apple, typographie calme, beaucoup d’espace, aucun jargon inutile.",
];

function createInitialState(): TuiState {
  return {
    input: DEFAULT_INPUT,
    result: "",
    status: "idle",
    profile: "auto",
    level: "standard",
    provider: "openai",
    model: "gpt-4.1-mini",
    activeOverlay: null,
    focusedElement: "editor",
    copied: false,
    stats: {
      elapsedMs: 0,
      inputTokens: 328,
      outputTokens: 0,
      estimatedCost: "mock",
    },
  };
}

export function useTuiController(): TuiController {
  const [state, setState] = useState<TuiState>(createInitialState);
  const runId = useRef(0);

  const setInput = useCallback((input: string) => {
    setState((prev) => ({ ...prev, input }));
  }, []);

  const setProfile = useCallback((profile: ProfileId) => {
    setState((prev) => ({ ...prev, profile, activeOverlay: null, focusedElement: "editor" }));
  }, []);

  const setLevel = useCallback((level: RepromptLevel) => {
    setState((prev) => ({ ...prev, level, activeOverlay: null, focusedElement: "editor" }));
  }, []);

  const setProvider = useCallback((provider: ProviderId) => {
    setState((prev) => ({
      ...prev,
      provider,
      model: MODEL_OPTIONS[provider][0]?.value ?? prev.model,
      activeOverlay: null,
      focusedElement: "editor",
    }));
  }, []);

  const setModel = useCallback((model: string) => {
    setState((prev) => ({ ...prev, model, activeOverlay: null, focusedElement: "editor" }));
  }, []);

  const setOverlay = useCallback((activeOverlay: TuiState["activeOverlay"]) => {
    setState((prev) => ({ ...prev, activeOverlay }));
  }, []);

  const setFocus = useCallback((focusedElement: TuiState["focusedElement"]) => {
    setState((prev) => ({ ...prev, focusedElement }));
  }, []);

  const resetResult = useCallback(() => {
    runId.current += 1;
    setState((prev) => ({
      ...prev,
      result: "",
      status: "idle",
      warning: undefined,
      error: undefined,
      stats: { ...prev.stats, elapsedMs: 0, outputTokens: 0 },
    }));
  }, []);

  const simulateError = useCallback(() => {
    runId.current += 1;
    setState((prev) => ({
      ...prev,
      status: prev.status === "error" ? (prev.result ? "success" : "idle") : "error",
      error:
        prev.status === "error"
          ? undefined
          : "Provider mock indisponible : cet état vérifie le rendu erreur sans perdre le dernier résultat.",
      stats:
        prev.status === "error"
          ? prev.stats
          : { ...prev.stats, elapsedMs: 842, outputTokens: prev.stats.outputTokens },
    }));
  }, []);

  const generate = useCallback(async (input: string) => {
    if (!input.trim()) return;
    const currentRun = runId.current + 1;
    runId.current = currentRun;
    const startedAt = Date.now();
    setState((prev) => ({
      ...prev,
      input,
      result: "",
      status: "loading",
      error: undefined,
      warning: undefined,
      copied: false,
      stats: {
        ...prev.stats,
        inputTokens: Math.max(32, Math.ceil(input.length / 4)),
        outputTokens: 0,
        elapsedMs: 0,
      },
    }));

    await delay(260);
    if (runId.current !== currentRun) return;
    setState((prev) => ({ ...prev, status: "streaming" }));

    let output = "";
    for (const delta of MOCK_DELTAS) {
      await delay(180);
      if (runId.current !== currentRun) return;
      output += delta;
      setState((prev) => ({
        ...prev,
        result: output,
        status: "streaming",
        stats: {
          ...prev.stats,
          elapsedMs: Date.now() - startedAt,
          outputTokens: Math.ceil(output.length / 4),
        },
      }));
    }

    setState((prev) => ({
      ...prev,
      status: "success",
      warning:
        "Qualité à vérifier : le POC simule une reformulation riche ; il ne garantit pas encore la fidélité métier.",
      stats: { ...prev.stats, elapsedMs: Date.now() - startedAt },
    }));
  }, []);

  const copyResult = useCallback(async () => {
    if (!state.result) return;
    setState((prev) => ({ ...prev, copied: true }));
    await delay(50);
    setTimeout(() => {
      setState((prev) => ({ ...prev, copied: false }));
    }, 1_400);
  }, [state.result]);

  return {
    state,
    setInput,
    setProfile,
    setLevel,
    setProvider,
    setModel,
    setOverlay,
    setFocus,
    generate,
    simulateError,
    resetResult,
    copyResult,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
