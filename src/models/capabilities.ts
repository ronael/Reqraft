import type { ProviderRequest } from "@/core/types.js";
import { findPreset } from "./presets.js";

type ReasoningEffort = NonNullable<ProviderRequest["reasoningEffort"]>;

export interface ModelCapabilities {
  supportsTemperature: boolean;
  reasoningEfforts: readonly ReasoningEffort[];
  maxOutputTokens?: number;
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsTemperature: true,
  reasoningEfforts: [],
};

export function resolveModelCapabilities(provider: string, model: string): ModelCapabilities {
  const preset = findPreset(provider, model);
  const outputLimit =
    preset?.maxOutputTokens === undefined ? {} : { maxOutputTokens: preset.maxOutputTokens };

  if (provider !== "openai") {
    return { ...DEFAULT_CAPABILITIES, ...outputLimit };
  }

  if (model.startsWith("gpt-5.1")) {
    return {
      supportsTemperature: false,
      reasoningEfforts: ["none", "low", "medium", "high"],
      ...outputLimit,
    };
  }

  if (model.startsWith("gpt-5") || model.startsWith("o")) {
    return {
      supportsTemperature: false,
      reasoningEfforts: ["low", "medium", "high"],
      ...outputLimit,
    };
  }

  return { ...DEFAULT_CAPABILITIES, ...outputLimit };
}
