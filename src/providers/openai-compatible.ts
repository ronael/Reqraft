import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
  ModelInfo,
} from "@/core/types.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { consumeChatCompletionStream } from "./openai-stream.js";
import { ProviderError, emptyAnswerError, raiseProviderError } from "./errors.js";
import { providerFetch } from "./http.js";
import { isLocalEndpoint, localServerKind, trimTrailingSlashes } from "./local-endpoint.js";

interface OpenAICompatibleChoice {
  message: { role: string; content: string | null };
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
  readonly local: boolean;
  /** The base URL as configured, without trailing slashes: paths are joined to it. */
  private readonly baseUrl: string;
  /** Set once the server refused `localExtras`: later calls go without them. */
  private localExtrasRefused = false;

  constructor(
    name: string,
    private readonly options: OpenAICompatibleOptions,
  ) {
    this.name = name;
    this.baseUrl = trimTrailingSlashes(options.baseUrl);
    this.local = isLocalEndpoint(this.baseUrl);
  }

  /**
   * The headers every request to the endpoint carries: the custom ones, then
   * the configured key, which wins over a stale Authorization header.
   */
  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...this.options.customHeaders };
    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }

  /**
   * What a server on the user's own hardware is asked on top of the standard
   * request.
   *
   * - `response_format` with the envelope's JSON Schema, so a small model's
   *   answer is constrained to valid JSON. `json_schema` rather than
   *   `json_object`: LM Studio accepts only the former, while Ollama,
   *   llama.cpp and vLLM accept both.
   * - `reasoning_effort: "none"`: a thinking model otherwise reasons before
   *   every rewrite — tens of seconds on a laptop, and output tokens taken
   *   from the answer, for a sentence to correct.
   * - `stream_options.include_usage` on a stream: Ollama and LM Studio only
   *   count tokens when asked, and the stats are blank without it.
   *
   * Neither belongs to every server's dialect. A server that refuses them with
   * a 400 is asked again without them, and not asked again by this adapter.
   * A hosted gateway gets neither: what it supports depends on the model it
   * routes to.
   */
  private localExtras(request: ProviderRequest): Record<string, unknown> {
    if (!this.local || this.localExtrasRefused || this.options.responseFormat) {
      return {};
    }
    return {
      ...(request.responseSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "reqraft_rewrite",
                strict: true,
                schema: request.responseSchema,
              },
            },
          }
        : {}),
      reasoning_effort: "none",
      ...(request.stream ? { stream_options: { include_usage: true } } : {}),
    };
  }

  private post(request: ProviderRequest, extras: Record<string, unknown>): Promise<Response> {
    return providerFetch(this.name, `${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        ...(this.options.responseFormat ? { response_format: this.options.responseFormat } : {}),
        ...extras,
        // Self-hosted gateways vary in their support for stream_options, so
        // usage is left to whatever the endpoint volunteers.
        ...(request.stream ? { stream: true } : {}),
        ...this.options.extraBody,
      }),
    });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const extras = this.localExtras(request);
    let response = await this.post(request, extras);
    if (response.status === 400 && Object.keys(extras).length > 0) {
      await response.body?.cancel();
      this.localExtrasRefused = true;
      response = await this.post(request, {});
    }

    if (!response.ok) {
      this.raiseError(response, await response.text(), request.model);
    }

    if (request.stream && response.body) {
      return await consumeChatCompletionStream(response.body, this.name, request.model, request);
    }

    const data = JSON.parse(await response.text()) as OpenAICompatibleResponse;
    const choice = data.choices[0];
    if (!choice) {
      throw emptyAnswerError(this.name, "OpenAI-compatible endpoint returned no choices");
    }

    return {
      // A thinking model whose reasoning the server kept apart can answer
      // with no content at all; the engine reports that as an empty result.
      text: choice.message.content ?? "",
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
      model: data.model,
      finishReason: choice.finish_reason,
    };
  }

  /**
   * A refused request, as an error the user can act on.
   *
   * A model the server does not have is the first thing a local setup runs
   * into — Ollama answers 404 until the model is pulled — and the generic
   * "request rejected" said neither which model nor how to get it. The model
   * named is the one Reqraft asked for, never text read from the body, which
   * stays out of every message.
   */
  private raiseError(response: Response, body: string, model: string): never {
    if (response.status === 404 && mentionsMissingModel(body)) {
      const server = /\bpull/i.test(body) ? "ollama" : localServerKind(this.baseUrl);
      throw new ProviderError(
        `Model not found: ${model}`,
        EXIT_CODES.INVALID_CONFIGURATION,
        undefined,
        {
          httpStatus: response.status,
          provider: this.name,
          errorCode: "provider.model_not_found",
          params: { model, ...(server === undefined ? {} : { server }) },
        },
      );
    }
    raiseProviderError(this.id, response, body);
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await providerFetch(this.name, `${this.baseUrl}/models`, {
      signal,
      headers: this.authHeaders(),
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
    if (!this.baseUrl) {
      return Promise.resolve({
        ok: false,
        code: "missing_configuration",
        missingConfiguration: ["baseUrl"],
      });
    }
    return Promise.resolve({ ok: true });
  }
}

/**
 * Whether a 404 body is about the model rather than the URL.
 *
 * Ollama says `model "x" not found, try pulling it first` (or, in newer
 * builds, `model 'x' not found`), OpenAI-style servers `The model x does not
 * exist` with the code `model_not_found`. A 404 that names no model is a
 * wrong base URL — `/v1` forgotten — and keeps the generic advice.
 */
function mentionsMissingModel(body: string): boolean {
  const message = errorMessageOf(body);
  return (
    /model_not_found/i.test(body) ||
    (/\bmodel\b/i.test(message) && /not found|does not exist|no such|not installed/i.test(message))
  );
}

/** The `error.message`, `error` or `message` of a JSON body, or the body itself. */
function errorMessageOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: unknown };
      message?: unknown;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (typeof parsed.error?.message === "string") return parsed.error.message;
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // Not JSON: the body is the message.
  }
  return body;
}
