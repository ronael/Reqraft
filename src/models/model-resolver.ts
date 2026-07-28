import { findPreset } from "./presets.js";

export interface ResolvedModel {
  model: string;
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

export function resolveModel(
  provider: string,
  requestedModel: string | undefined,
  defaultModel: string,
): ResolvedModel {
  const model = requestedModel ?? defaultModel;
  const preset = findPreset(provider, model);
  return {
    model,
    reasoningEffort: preset?.reasoningEffort,
  };
}
