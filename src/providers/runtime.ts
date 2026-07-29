import type { Config } from "../config/schema.js";
import type { ProviderAdapter, ProviderRequest } from "../core/types.js";
import { resolveModel } from "../models/model-resolver.js";
import { isBuiltinProvider, type BuiltinProvider } from "./catalog.js";
import { createProvider } from "./registry.js";

type ReasoningEffort = NonNullable<ProviderRequest["reasoningEffort"]>;

export interface ProviderRuntimeInput {
  providerId: string;
  requestedModel?: string;
  defaultModel: string;
  env: NodeJS.ProcessEnv;
  config?: Config;
}

export interface ProviderRuntime {
  providerId: BuiltinProvider;
  provider: ProviderAdapter;
  model: string;
  reasoningEffort?: ReasoningEffort;
}

export function resolveProviderRuntime(input: ProviderRuntimeInput): ProviderRuntime {
  if (!isBuiltinProvider(input.providerId)) {
    throw new Error(`Provider non supporté : ${input.providerId}`);
  }

  const provider = createProvider(input.providerId, input.env, input.config);
  const { model, reasoningEffort } = resolveModel(
    input.providerId,
    input.requestedModel,
    input.defaultModel,
  );

  return {
    providerId: input.providerId,
    provider,
    model,
    reasoningEffort,
  };
}
