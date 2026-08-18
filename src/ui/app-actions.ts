import type { ExecuteRepromptInput } from "@/application/reprompt.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import type { AppState } from "./app-state.js";

export function createUiRepromptInput(
  state: AppState,
  config: Config | null,
  env: NodeJS.ProcessEnv,
): ExecuteRepromptInput {
  return {
    input: state.input,
    profileId: state.profile,
    level: state.level,
    providerId: state.provider,
    requestedModel: state.model,
    defaultModel: state.model,
    env,
    config: config ?? undefined,
    stream: resolveUiStreamPreference(config),
    fidelityMode: config?.fidelityMode,
    timeoutMs: config?.timeoutMs,
    maxOutputTokens: config?.maxOutputTokens,
    outputLanguage:
      config?.outputLanguage && config.outputLanguage !== "auto"
        ? config.outputLanguage
        : undefined,
  };
}

export function resolveUiStreamPreference(config: Config | null): boolean {
  return config?.stream ?? DEFAULT_CONFIG.stream;
}
