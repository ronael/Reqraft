import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ModelInfo,
} from "@/core/types.js";
import { consumeChatCompletionStream } from "./openai-stream.js";
import { raiseProviderError } from "./errors.js";
import { providerFetch } from "./http.js";

interface OpenAICompatibleChoice {
  message: { role: string; content: string };
  finish_reason?: string;
}

interface OpenAICompatibleResponse {
  choices: OpenAICompatibleChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
  responseFormat?: { type: "json_object" };
  extraBody?: Record<string, unknown>;
}

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly id = "openai-compatible";
  readonly name: string;

  constructor(
    name: string,
    private readonly options: OpenAICompatibleOptions,
  ) {
    this.name = name;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.options.customHeaders,
    };
    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }

    const response = await providerFetch(this.name, `${this.options.baseUrl}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers,
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        ...(this.options.responseFormat ? { response_format: this.options.responseFormat } : {}),
        // Self-hosted gateways vary in their support for stream_options, so
        // usage is left to whatever the endpoint volunteers.
        ...(request.stream ? { stream: true } : {}),
        ...this.options.extraBody,
      }),
    });

    if (!response.ok) {
      raiseProviderError(this.id, response, await response.text());
    }

    if (request.stream && response.body) {
      return await consumeChatCompletionStream(
        response.body,
        this.name,
        request.model,
        request.onDelta,
      );
    }

    const data = JSON.parse(await response.text()) as OpenAICompatibleResponse;
    const choice = data.choices[0];
    if (!choice) {
      throw new Error("OpenAI-compatible endpoint returned no choices");
    }

    return {
      text: choice.message.content,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
      model: data.model,
      finishReason: choice.finish_reason,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await providerFetch(this.name, `${this.options.baseUrl}/models`, {
      signal,
      headers: this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      raiseProviderError(this.id, response, text);
    }
    const data = JSON.parse(text) as { data: { id: string }[] };
    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      provider: this.id,
    }));
  }

  validateConfiguration(): Promise<ProviderHealth> {
    if (!this.options.baseUrl) {
      return Promise.resolve({
        ok: false,
        code: "missing_configuration",
        missingConfiguration: ["baseUrl"],
      });
    }
    return Promise.resolve({ ok: true });
  }
}
