import { ConfigSchema, type Config } from "./schema.js";
import { DEFAULT_CONFIG } from "./loader.js";
import {
  type BuiltinProvider,
  type InitProvider,
  getProviderDefinition,
  OPENAI_COMPATIBLE_PROVIDER_ID,
} from "@/providers/catalog.js";

/**
 * What "this installation is configured" means, and how a configuration is
 * built from a set of choices.
 *
 * Both interfaces need this: `rp init` in the terminal and the desktop
 * onboarding window. They are two front ends over one decision, so the
 * decision lives here rather than in either of them — the desktop must never
 * shell out to `rp init`, and duplicating the rule would let the two drift
 * into disagreeing about whether the same machine is set up.
 */

export interface CompatibleProviderInput {
  id: string;
  name?: string;
  baseUrl: string;
  apiKeyEnv?: string;
  customHeaders?: Record<string, string>;
}

export interface InitConfigInput {
  provider: InitProvider;
  model: string;
  profile: string;
  level: Config["defaultLevel"];
  copyAfterGeneration: boolean;
  stream: boolean;
  timeoutMs: number;
  uiLocale?: Config["uiLocale"];
  outputLanguage?: Config["outputLanguage"];
  compatibleProvider?: CompatibleProviderInput;
  existing?: Config;
}

export interface ApiKeyStatus {
  envName?: string;
  detected: boolean;
  optional?: boolean;
}

/**
 * Whether an API key is present for a provider, and whether it is even needed.
 *
 * `optional` is not the same as `detected`: a local or compatible endpoint may
 * legitimately have no key at all, and reporting that as "missing" would send
 * someone hunting for a credential that does not exist.
 */
export function buildApiKeyStatus(
  provider: InitProvider,
  env: NodeJS.ProcessEnv,
  apiKeyEnv?: string,
): ApiKeyStatus {
  const definition = getProviderDefinition(provider);
  const envName = apiKeyEnv ?? definition.apiKeyEnvName;
  const optional = !definition.requiresApiKey;
  if (!envName) {
    return { detected: false, optional };
  }
  return { envName, detected: Boolean(env[envName]), optional };
}

/** Builds the configuration to persist, validated by the shared schema. */
export function createInitConfig(input: InitConfigInput): Config {
  const providers = { ...(input.existing?.providers ?? {}) };
  if (input.compatibleProvider) {
    providers[input.compatibleProvider.id] = {
      type: OPENAI_COMPATIBLE_PROVIDER_ID,
      name: input.compatibleProvider.name,
      baseUrl: input.compatibleProvider.baseUrl,
      apiKeyEnv: input.compatibleProvider.apiKeyEnv,
      customHeaders: input.compatibleProvider.customHeaders,
    };
  }

  return ConfigSchema.parse({
    ...(input.existing ?? {}),
    defaultProvider: input.provider,
    defaultModel: input.model,
    defaultProfile: input.profile,
    defaultLevel: input.level,
    copyAfterGeneration: input.copyAfterGeneration,
    stream: input.stream,
    timeoutMs: input.timeoutMs,
    uiLocale: input.uiLocale ?? input.existing?.uiLocale ?? DEFAULT_CONFIG.uiLocale,
    outputLanguage:
      input.outputLanguage ?? input.existing?.outputLanguage ?? DEFAULT_CONFIG.outputLanguage,
    showChanges: input.existing?.showChanges ?? DEFAULT_CONFIG.showChanges,
    showStats: input.existing?.showStats ?? DEFAULT_CONFIG.showStats,
    telemetry: false,
    providers: Object.keys(providers).length > 0 ? providers : undefined,
  });
}

/** Why a configuration cannot be used as it stands. */
export const SETUP_BLOCKERS = [
  "config_missing",
  "provider_incomplete",
  "credential_missing",
] as const;
export type SetupBlocker = (typeof SETUP_BLOCKERS)[number];

export interface SetupFacts {
  /**
   * Whether the configuration file exists on disk.
   *
   * Load it and you always get a valid object — every field in `ConfigSchema`
   * has a default. So a parsed configuration proves nothing about whether
   * anyone ever made a choice; only the file's existence does.
   */
  configFileExists: boolean;
  provider: BuiltinProvider;
  /** Whether a credential is available, from the environment or the keychain. */
  credentialDetected: boolean;
  /** Whether the configuration declares the custom endpoint it points at. */
  hasCustomProviderEntry: boolean;
}

export interface SetupState {
  usable: boolean;
  blocker?: SetupBlocker;
}

/**
 * Decides whether an installation can be used as it stands.
 *
 * Pure on purpose: the facts are gathered by whoever has the filesystem and
 * the keychain, and the rule stays testable without either.
 */
export function evaluateSetupState(facts: SetupFacts): SetupState {
  if (!facts.configFileExists) {
    return { usable: false, blocker: "config_missing" };
  }

  // A compatible endpoint is named by the configuration, not by the catalogue:
  // pointing at it without declaring it leaves nothing to call.
  if (facts.provider === OPENAI_COMPATIBLE_PROVIDER_ID && !facts.hasCustomProviderEntry) {
    return { usable: false, blocker: "provider_incomplete" };
  }

  if (getProviderDefinition(facts.provider).requiresApiKey && !facts.credentialDetected) {
    return { usable: false, blocker: "credential_missing" };
  }

  return { usable: true };
}
