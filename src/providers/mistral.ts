import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ModelInfo,
} from "../core/types.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { ProviderError } from "./errors.js";

export class MistralProvider implements ProviderAdapter {
  readonly id = "mistral";
  readonly name = "Mistral";
  private readonly adapter: OpenAICompatibleProvider;

  constructor(
    private readonly apiKey: string,
    baseUrl = "https://api.mistral.ai/v1",
  ) {
    this.adapter = new OpenAICompatibleProvider("Mistral", {
      baseUrl,
      apiKey,
      responseFormat: { type: "json_object" },
    });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    try {
      return await this.adapter.generate(request);
    } catch (error) {
      if (isTransientMistralError(error)) {
        return this.adapter.generate(request);
      }
      throw error;
    }
  }

  listModels(): Promise<ModelInfo[]> {
    return this.adapter.listModels();
  }

  validateConfiguration(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return Promise.resolve({
        ok: false,
        message: "Clé API Mistral manquante (MISTRAL_API_KEY).",
        missingConfiguration: ["MISTRAL_API_KEY"],
      });
    }
    return Promise.resolve({ ok: true, message: "Mistral est configuré." });
  }
}

function isTransientMistralError(error: unknown): error is ProviderError {
  return error instanceof ProviderError && error.message.startsWith("Provider error 503:");
}
