import type { ProviderAdapter } from "@/core/types.js";
import { AnthropicProvider } from "./anthropic.js";
import { DeepSeekProvider } from "./deepseek.js";
import { MistralProvider } from "./mistral.js";
import { MockProvider } from "./mock.js";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { OpenAIProvider } from "./openai.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { Config } from "@/config/schema.js";
import {
  type BuiltinProvider,
  type CredentialProvider,
  getProviderDefinition,
  type CredentialProviderDefinition,
  listProviderDefinitions,
  listCredentialProviders,
  OPENAI_COMPATIBLE_PROVIDER_ID,
} from "./catalog.js";

type ProviderFactory = (env: NodeJS.ProcessEnv, config?: Config) => ProviderAdapter;
type CredentialProviderFactory = (
  apiKey: string,
  missingConfiguration: string[],
) => ProviderAdapter;

const CREDENTIAL_PROVIDER_FACTORIES = new Map<CredentialProvider, CredentialProviderFactory>([
  [
    "anthropic",
    (apiKey, missingConfiguration) =>
      new AnthropicProvider(apiKey, undefined, missingConfiguration),
  ],
  [
    "openai",
    (apiKey, missingConfiguration) => new OpenAIProvider(apiKey, undefined, missingConfiguration),
  ],
  [
    "deepseek",
    (apiKey, missingConfiguration) => new DeepSeekProvider(apiKey, undefined, missingConfiguration),
  ],
  [
    "mistral",
    (apiKey, missingConfiguration) => new MistralProvider(apiKey, undefined, missingConfiguration),
  ],
]);

/**
 * Single source of truth for the built-in providers.
 *
 * `listProviders` derives from these keys, so adding an adapter here is enough
 * to expose it everywhere.
 */
const PROVIDER_FACTORIES = new Map<BuiltinProvider, ProviderFactory>([
  ...listCredentialProviders().map((definition): [BuiltinProvider, ProviderFactory] => [
    definition.id,
    (env) => createCredentialProvider(definition, env),
  ]),
  [OPENAI_COMPATIBLE_PROVIDER_ID, (env, config) => createOpenAICompatibleProvider(env, config)],
  ["mock", () => new MockProvider()],
]);

export function createProvider(
  id: BuiltinProvider,
  env: NodeJS.ProcessEnv,
  config?: Config,
): ProviderAdapter {
  const factory = PROVIDER_FACTORIES.get(id);
  if (!factory) {
    throw new ReqraftError("provider.unsupported", EXIT_CODES.INVALID_CONFIGURATION, {
      params: { provider: id },
    });
  }
  return factory(env, config);
}

function createCredentialProvider(
  definition: CredentialProviderDefinition,
  env: NodeJS.ProcessEnv,
): ProviderAdapter {
  const factory = CREDENTIAL_PROVIDER_FACTORIES.get(definition.id);
  if (!factory) {
    throw new ReqraftError("provider.unsupported", EXIT_CODES.INVALID_CONFIGURATION, {
      params: { provider: definition.id },
    });
  }

  return factory(env[definition.apiKeyEnvName] ?? "", [definition.apiKeyEnvName]);
}

function createOpenAICompatibleProvider(
  env: NodeJS.ProcessEnv,
  config?: Config,
): OpenAICompatibleProvider {
  const providerConfig = config?.providers ? Object.values(config.providers)[0] : undefined;
  if (providerConfig) {
    return new OpenAICompatibleProvider(
      providerConfig.name ?? getProviderDefinition(OPENAI_COMPATIBLE_PROVIDER_ID).label,
      {
        baseUrl: providerConfig.baseUrl,
        apiKey: providerConfig.apiKeyEnv ? env[providerConfig.apiKeyEnv] : undefined,
        customHeaders: providerConfig.customHeaders,
      },
    );
  }

  return new OpenAICompatibleProvider(getProviderDefinition(OPENAI_COMPATIBLE_PROVIDER_ID).label, {
    baseUrl: env.RP_OPENAI_COMPATIBLE_BASE_URL ?? "",
    apiKey: env.RP_OPENAI_COMPATIBLE_API_KEY,
  });
}

export function listProviders(): BuiltinProvider[] {
  return listProviderDefinitions().map((definition) => definition.id);
}
