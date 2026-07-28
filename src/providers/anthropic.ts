import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ModelInfo,
} from "../core/types.js";
import { ProviderError, raiseProviderError } from "./errors.js";

interface AnthropicContent {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content: AnthropicContent[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  model?: string;
  stop_reason?: string;
}

export class AnthropicProvider implements ProviderAdapter {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.anthropic.com/v1",
  ) {}

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxOutputTokens,
        temperature: request.temperature,
        system: request.systemPrompt,
        messages: [{ role: "user", content: request.userPrompt }],
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      raiseProviderError(response, text);
    }

    const data = JSON.parse(text) as AnthropicResponse;
    const firstContent = data.content[0];
    if (!firstContent) {
      throw new ProviderError("Anthropic returned no content", 5);
    }
    const firstText = firstContent.text;

    return {
      text: firstText,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      model: data.model,
      finishReason: data.stop_reason,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
    });
    const text = await response.text();
    if (!response.ok) {
      raiseProviderError(response, text);
    }
    const data = JSON.parse(text) as { data: { id: string; display_name?: string }[] };
    return data.data.map((m) => ({
      id: m.id,
      name: m.display_name ?? m.id,
      provider: this.id,
    }));
  }

  validateConfiguration(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return Promise.resolve({
        ok: false,
        message: "Clé API Anthropic manquante (ANTHROPIC_API_KEY).",
        missingConfiguration: ["ANTHROPIC_API_KEY"],
      });
    }
    return Promise.resolve({ ok: true, message: "Anthropic est configuré." });
  }
}
