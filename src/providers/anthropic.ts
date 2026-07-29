import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ModelInfo,
} from "../core/types.js";
import { ProviderError, raiseProviderError } from "./errors.js";

interface AnthropicContent {
  type: string;
  text?: string;
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
      signal: request.signal,
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
        stream: request.stream,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      raiseProviderError(response, text);
    }

    if (request.stream) {
      return parseStreamingResponse(await response.text(), request.model);
    }

    const text = await response.text();

    const data = JSON.parse(text) as AnthropicResponse;
    const firstContent = data.content.find((content) => content.type === "text");
    if (!firstContent) {
      throw new ProviderError("Anthropic returned no content", 5);
    }
    const firstText = firstContent.text;
    if (!firstText) {
      throw new ProviderError("Anthropic returned an empty text block", 5);
    }

    return {
      text: firstText,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        visibleOutputTokens: data.usage?.output_tokens,
      },
      model: data.model,
      finishReason: data.stop_reason,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      signal,
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

function parseStreamingResponse(stream: string, requestedModel: string): ProviderResponse {
  let text = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let model: string | undefined;
  let finishReason: string | undefined;

  for (const line of stream.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;

    const event = JSON.parse(line.slice("data: ".length)) as AnthropicStreamEvent;
    if (event.type === "error") {
      throw new ProviderError(
        `Anthropic streaming error: ${event.error?.message ?? "unknown error"}`,
        4,
      );
    }
    if (event.type === "message_start") {
      inputTokens = event.message?.usage?.input_tokens;
      model = event.message?.model;
    }
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      text += event.delta.text ?? "";
    }
    if (event.type === "message_delta") {
      outputTokens = event.usage?.output_tokens;
      finishReason = event.delta?.stop_reason;
    }
  }

  if (!text) {
    throw new ProviderError("Anthropic streaming response contained no text", 5);
  }

  return {
    text,
    usage: { inputTokens, outputTokens, visibleOutputTokens: outputTokens },
    model: model ?? requestedModel,
    finishReason,
  };
}

interface AnthropicStreamEvent {
  type: string;
  message?: { model?: string; usage?: { input_tokens?: number } };
  delta?: { type?: string; text?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
  error?: { message?: string };
}
