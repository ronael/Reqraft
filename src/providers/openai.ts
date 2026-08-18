import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ModelInfo,
} from "@/core/types.js";
import { consumeChatCompletionStream } from "./openai-stream.js";
import { ProviderError, raiseProviderError } from "./errors.js";
import { providerFetch } from "./http.js";
import { resolveModelCapabilities } from "@/models/capabilities.js";

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChoice {
  message: OpenAIMessage;
  finish_reason?: string;
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
  model?: string;
}

export class OpenAIProvider implements ProviderAdapter {
  readonly id = "openai";
  readonly name = "OpenAI";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly missingConfiguration = ["apiKey"],
  ) {}

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const capabilities = resolveModelCapabilities(this.id, request.model);
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      max_completion_tokens: request.maxOutputTokens,
      response_format: { type: "json_object" },
    };

    if (request.stream) {
      body.stream = true;
      // Without this the stream carries no usage at all, and the stats panel
      // would go blank whenever streaming is on.
      body.stream_options = { include_usage: true };
    }

    if (capabilities.supportsTemperature) {
      body.temperature = request.temperature;
    }

    if (
      request.reasoningEffort &&
      capabilities.reasoningEfforts.includes(request.reasoningEffort)
    ) {
      body.reasoning_effort = request.reasoningEffort;
    }

    const response = await providerFetch(this.name, `${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
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

    const data = JSON.parse(await response.text()) as OpenAIResponse;
    const choice = data.choices[0];
    if (!choice) {
      throw new ProviderError("OpenAI returned no choices", 5);
    }

    return {
      text: choice.message.content,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
        visibleOutputTokens: calculateVisibleOutputTokens(
          data.usage?.completion_tokens,
          data.usage?.completion_tokens_details?.reasoning_tokens,
        ),
      },
      model: data.model,
      finishReason: choice.finish_reason,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await providerFetch(this.name, `${this.baseUrl}/models`, {
      signal,
      headers: { Authorization: `Bearer ${this.apiKey}` },
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
    if (!this.apiKey) {
      return Promise.resolve({
        ok: false,
        code: "missing_configuration",
        missingConfiguration: this.missingConfiguration,
      });
    }
    return Promise.resolve({ ok: true });
  }
}

function calculateVisibleOutputTokens(
  outputTokens: number | undefined,
  reasoningTokens: number | undefined,
): number | undefined {
  if (outputTokens === undefined || reasoningTokens === undefined) {
    return undefined;
  }
  return Math.max(outputTokens - reasoningTokens, 0);
}
