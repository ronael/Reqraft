import type { ModelInfo } from "../core/types.js";

export const MODEL_PRESETS_UPDATED_AT = "2026-07-28";

export interface ModelPreset {
  id: string;
  name: string;
  provider: string;
  description: string;
  recommended?: boolean;
  category: "budget" | "fast" | "openai" | "european" | "quality" | "custom";
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "claude-haiku-4-5",
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
    id: "gpt-5.4-mini",
    name: "GPT-5.4 mini",
    provider: "openai",
    description: "Rapide et efficace pour le code et les sous-agents.",
    recommended: true,
    category: "openai",
    reasoningEffort: "none",
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 nano",
    provider: "openai",
    description: "Alternative économique à tester.",
    category: "budget",
    reasoningEffort: "none",
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 terra",
    provider: "openai",
    description: "Compromis intelligence/coût dans la famille GPT-5.6.",
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
  return MODEL_PRESETS.find((p) => p.provider === providerId && p.id === modelId);
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
