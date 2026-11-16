import type { ExecuteRepromptInput } from "@/application/reprompt.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import { detectSecretKinds } from "@/core/secret-detector.js";
import type { Translator } from "@/i18n/translate.js";
import type { UiError } from "@/shared/errors.js";
import type { AppState } from "./app-state.js";

/**
 * The CLI's secret check, for the editor.
 *
 * `rp "<text>"` refuses a text holding a secret unless --redact-secrets or
 * --force says otherwise (commands/reprompt.ts). The editor has neither, so a
 * secret stops the send before anything leaves the machine, and the error
 * names what was found and how to go on.
 */
export function refuseSecrets(input: string, t: Translator): UiError | null {
  const kinds = detectSecretKinds(input);
  if (kinds.length === 0) return null;
  return {
    title: t("tui.secret.title"),
    message: t("tui.secret.message", { kinds: kinds.join(", ") }),
    nextAction: t("tui.secret.action"),
  };
}

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
