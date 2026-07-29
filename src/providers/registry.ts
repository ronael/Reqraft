import type { ProviderAdapter } from "../core/types.js";
import { AnthropicProvider } from "./anthropic.js";
import { DeepSeekProvider } from "./deepseek.js";
import { MistralProvider } from "./mistral.js";
import { MockProvider } from "./mock.js";
import { OpenAIProvider } from "./openai.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { Config } from "../config/schema.js";

export type BuiltinProvider =
  "anthropic" | "openai" | "deepseek" | "mistral" | "openai-compatible" | "mock";

type ProviderFactory = (env: NodeJS.ProcessEnv, config?: Config) => ProviderAdapter;

/**
 * Single source of truth for the built-in providers.
 *
 * `listProviders` derives from these keys, so adding an adapter here is enough
 * to expose it everywhere.
 */
const PROVIDER_FACTORIES: Record<BuiltinProvider, ProviderFactory> = {
  anthropic: (env) => new AnthropicProvider(env.ANTHROPIC_API_KEY ?? ""),
  openai: (env) => new OpenAIProvider(env.OPENAI_API_KEY ?? ""),
  deepseek: (env) => new DeepSeekProvider(env.DEEPSEEK_API_KEY ?? ""),
  mistral: (env) => new MistralProvider(env.MISTRAL_API_KEY ?? ""),
  "openai-compatible": (env, config) => createOpenAICompatibleProvider(env, config),
  mock: () => new MockProvider(),
};

export function createProvider(
  id: BuiltinProvider,
  env: NodeJS.ProcessEnv,
  config?: Config,
): ProviderAdapter {
  const factory = PROVIDER_FACTORIES[id] as ProviderFactory | undefined;
  if (!factory) {
    throw new Error(`Provider non supporté : ${id}`);
  }
  return factory(env, config);
}

function createOpenAICompatibleProvider(
  env: NodeJS.ProcessEnv,
  config?: Config,
): OpenAICompatibleProvider {
  const providerConfig = config?.providers ? Object.values(config.providers)[0] : undefined;
  if (providerConfig) {
    return new OpenAICompatibleProvider(providerConfig.name ?? "OpenAI Compatible", {
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKeyEnv ? env[providerConfig.apiKeyEnv] : undefined,
      customHeaders: providerConfig.customHeaders,
    });
  }

  return new OpenAICompatibleProvider("OpenAI Compatible", {
    baseUrl: env.RP_OPENAI_COMPATIBLE_BASE_URL ?? "",
    apiKey: env.RP_OPENAI_COMPATIBLE_API_KEY,
  });
}

export function listProviders(): string[] {
  return Object.keys(PROVIDER_FACTORIES);
}
