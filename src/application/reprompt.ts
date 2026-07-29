import type { Config } from "../config/schema.js";
import { hydrateCredentials } from "../auth/credentials.js";
import { rewrite } from "../core/engine.js";
import { prepareRewriteOptions } from "../core/rewrite-options.js";
import type { FidelityMode, RepromptLevel, RepromptResult } from "../core/types.js";
import { resolveProfile } from "../profiles/registry.js";
import { resolveProviderRuntime } from "../providers/runtime.js";

interface ExecuteRepromptDependencies {
  hydrateCredentials(env: NodeJS.ProcessEnv): Promise<void>;
}

export interface ExecuteRepromptInput {
  input: string;
  profileId: string;
  level: RepromptLevel;
  providerId: string;
  requestedModel?: string;
  defaultModel: string;
  env: NodeJS.ProcessEnv;
  config?: Config;
  stream?: boolean;
  fidelityMode?: FidelityMode;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

export interface ExecuteRepromptResult {
  result: RepromptResult;
  detectedProfile: boolean;
}

const DEFAULT_DEPENDENCIES: ExecuteRepromptDependencies = {
  hydrateCredentials,
};

export async function executeReprompt(
  input: ExecuteRepromptInput,
  dependencies: ExecuteRepromptDependencies = DEFAULT_DEPENDENCIES,
): Promise<ExecuteRepromptResult> {
  await dependencies.hydrateCredentials(input.env);

  const { profile, detected } = resolveProfile(input.profileId, input.input);
  const { provider, model, reasoningEffort } = resolveProviderRuntime({
    providerId: input.providerId,
    requestedModel: input.requestedModel,
    defaultModel: input.defaultModel,
    env: input.env,
    config: input.config,
  });

  const result = await rewrite(
    prepareRewriteOptions({
      input: input.input,
      profile,
      level: input.level,
      provider,
      model,
      stream: input.stream,
      reasoningEffort,
      fidelityMode: input.fidelityMode,
      timeoutMs: input.timeoutMs,
      maxOutputTokens: input.maxOutputTokens,
    }),
  );

  return { result, detectedProfile: detected };
}
