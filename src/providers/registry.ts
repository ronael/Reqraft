import type { ProviderAdapter } from "../core/types.js";
import { AnthropicProvider } from "./anthropic.js";
import { DeepSeekProvider } from "./deepseek.js";
import { MistralProvider } from "./mistral.js";
import { MockProvider } from "./mock.js";
import { OpenAIProvider } from "./openai.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

export type BuiltinProvider =
  | "anthropic"
  | "openai"
  | "deepseek"
  | "mistral"
  | "openai-compatible"
  | "mock";

export function createProvider(
  id: BuiltinProvider,
  env: NodeJS.ProcessEnv,
): ProviderAdapter {
  switch (id) {
    case "anthropic":
      return new AnthropicProvider(env.ANTHROPIC_API_KEY ?? "");
    case "openai":
      return new OpenAIProvider(env.OPENAI_API_KEY ?? "");
    case "deepseek":
      return new DeepSeekProvider(env.DEEPSEEK_API_KEY ?? "");
    case "mistral":
      return new MistralProvider(env.MISTRAL_API_KEY ?? "");
    case "openai-compatible":
      return new OpenAICompatibleProvider("OpenAI Compatible", {
        baseUrl: env.RP_OPENAI_COMPATIBLE_BASE_URL ?? "",
        apiKey: env.RP_OPENAI_COMPATIBLE_API_KEY,
      });
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`Provider non supporté : ${String(id)}`);
  }
}

export function listProviders(): string[] {
  return ["anthropic", "openai", "deepseek", "mistral", "openai-compatible", "mock"];
}
