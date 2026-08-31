import { hydrateCredentials } from "@/auth/credentials.js";
import type { Config } from "@/config/schema.js";
import { getProviderEnvName } from "@/providers/catalog.js";

/** Build the credential environment owned by the Desktop process. */
export async function createDesktopCredentialEnvironment(
  source: NodeJS.ProcessEnv,
  config: Pick<Config, "desktopKeychainProviders">,
  hydrate: (env: NodeJS.ProcessEnv) => Promise<void> = hydrateCredentials,
): Promise<NodeJS.ProcessEnv> {
  const desktopEnv = { ...source };
  for (const provider of config.desktopKeychainProviders ?? []) {
    Reflect.deleteProperty(desktopEnv, getProviderEnvName(provider));
  }
  await hydrate(desktopEnv);
  return desktopEnv;
}
