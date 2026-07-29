import type { ModelInfo } from "../core/types.js";
import type { BuiltinProvider } from "../providers/catalog.js";

export const MODEL_PRESETS_UPDATED_AT = "2026-07-28";
export const DEFAULT_MODEL_ID = "claude-haiku-4-5";

export interface ModelPreset {
  id: string;
  name: string;
  provider: BuiltinProvider;
  description: string;
  recommended?: boolean;
  category: "budget" | "fast" | "openai" | "european" | "quality" | "custom";
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: DEFAULT_MODEL_ID,
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Rapide et efficace pour le reprompting quotidien.",
    recommended: true,
    category: "fast",
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    description: "Meilleur compromis vitesse/intelligence pour les cas complexes.",
    category: "quality",
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 mini",
    provider: "openai",
    description: "Rapide et fiable pour le reprompting avec sortie visible immédiate.",
    recommended: true,
    category: "fast",
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 mini",
    provider: "openai",
    description: "Version rapide et économique de GPT-5 pour les tâches bien définies.",
    category: "openai",
    reasoningEffort: "low",
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 nano",
    provider: "openai",
    description: "Version la plus rapide et la plus économique de GPT-5.",
    category: "budget",
    reasoningEffort: "low",
  },
  {
    id: "gpt-5.1",
    name: "GPT-5.1",
    provider: "openai",
    description: "Modèle avancé pour le code et les tâches agentiques.",
    category: "quality",
    reasoningEffort: "none",
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    description: "Économique, mode non-thinking par défaut.",
    recommended: true,
    category: "budget",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    description: "Alternative de qualité.",
    category: "quality",
  },
  {
    id: "mistral-small-2603",
    name: "Mistral Small 4",
    provider: "mistral",
    description: "Efficace pour le code et les reformulations rapides.",
    recommended: true,
    category: "european",
  },
];

export function getPresetModels(): ModelPreset[] {
  return [...MODEL_PRESETS];
}

export function findPreset(providerId: string, modelId: string): ModelPreset | undefined {
  const providerPresets = MODEL_PRESETS.filter((p) => p.provider === providerId);
  return (
    providerPresets.find((p) => p.id === modelId) ??
    providerPresets.find((p) => modelId.startsWith(`${p.id}-`))
  );
}

export function listRecommendedModels(): ModelPreset[] {
  return MODEL_PRESETS.filter((p) => p.recommended);
}

export function toModelInfo(preset: ModelPreset): ModelInfo {
  return {
    id: preset.id,
    name: preset.name,
    provider: preset.provider,
    description: preset.description,
    contextWindow: preset.contextWindow,
    maxOutputTokens: preset.maxOutputTokens,
  };
}
