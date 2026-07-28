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

  listModels(): Promise<ModelInfo[]> {
    return this.adapter.listModels();
  }

  validateConfiguration(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return Promise.resolve({
        ok: false,
        message: "Clé API DeepSeek manquante (DEEPSEEK_API_KEY).",
        missingConfiguration: ["DEEPSEEK_API_KEY"],
      });
    }
    return Promise.resolve({
      ok: true,
      message: "DeepSeek est configuré.",
    });
  }
}
