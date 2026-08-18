import { DEFAULT_CONFIG, loadConfig } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import { hydrateCredentials } from "@/auth/credentials.js";

export interface BootstrapDependencies {
  hydrateCredentials(env: NodeJS.ProcessEnv): Promise<void>;
  loadConfig(): Promise<Config>;
}

export interface BootstrapResult {
  config: Config;
  credentialError?: unknown;
  configError?: unknown;
}

const DEFAULT_DEPENDENCIES: BootstrapDependencies = {
  hydrateCredentials,
  loadConfig,
};

export async function bootstrapConfiguration(
  env: NodeJS.ProcessEnv,
  dependencies: BootstrapDependencies = DEFAULT_DEPENDENCIES,
): Promise<BootstrapResult> {
  let credentialError: unknown;
  try {
    await dependencies.hydrateCredentials(env);
  } catch (error) {
    credentialError = error;
  }

  try {
    return {
      config: await dependencies.loadConfig(),
      credentialError,
    };
  } catch (configError) {
    return {
      config: DEFAULT_CONFIG,
      credentialError,
      configError,
    };
  }
}

export function getBootstrapError(result: BootstrapResult): unknown {
  return result.configError ?? result.credentialError;
}
