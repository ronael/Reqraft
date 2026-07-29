import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ModelInfo,
} from "../core/types.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

export class DeepSeekProvider implements ProviderAdapter {
  readonly id = "deepseek";
  readonly name = "DeepSeek";
  private readonly adapter: OpenAICompatibleProvider;

  constructor(
    private readonly apiKey: string,
    baseUrl = "https://api.deepseek.com/v1",
    private readonly missingConfiguration = ["apiKey"],
  ) {
    this.adapter = new OpenAICompatibleProvider("DeepSeek", {
      baseUrl,
      apiKey,
      responseFormat: { type: "json_object" },
      extraBody: { thinking: { type: "disabled" } },
    });
  }

  generate(request: ProviderRequest): Promise<ProviderResponse> {
    return this.adapter.generate(request);
  }

  listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    return this.adapter.listModels(signal);
  }

  validateConfiguration(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return Promise.resolve({
        ok: false,
        message: `Clé API DeepSeek manquante (${this.missingConfiguration.join(", ")}).`,
        missingConfiguration: this.missingConfiguration,
      });
    }
    return Promise.resolve({
      ok: true,
      message: "DeepSeek est configuré.",
    });
  }
}
