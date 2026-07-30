import type { ProviderResponse } from "../core/types.js";
import { ProviderError } from "./errors.js";
import { parseDataLine, streamLines } from "./sse.js";

/** Sentinel closing an OpenAI-compatible stream. */
const DONE = "[DONE]";

interface ChatCompletionChunk {
  model?: string;
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

export interface ChatCompletionAccumulator {
  /** Visible text carried by this line, if any. */
  consume(line: string): string | undefined;
  finish(requestedModel: string): ProviderResponse;
}

/**
 * Assembles a `chat/completions` stream.
 *
 * Shared by the OpenAI adapter and every OpenAI-compatible one, so the four
 * providers speaking that dialect cannot drift apart.
 */
export function createChatCompletionAccumulator(providerName: string): ChatCompletionAccumulator {
  let text = "";
  let model: string | undefined;
  let finishReason: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let reasoningTokens: number | undefined;

  return {
    consume(line) {
      const payload = parseDataLine(line);
      if (payload === undefined || payload === "" || payload === DONE) {
        return undefined;
      }

      const chunk = JSON.parse(payload) as ChatCompletionChunk;
      model ??= chunk.model;
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
        reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens;
      }

      const choice = chunk.choices?.[0];
      finishReason = choice?.finish_reason ?? finishReason;
      const fragment = choice?.delta?.content;
      if (typeof fragment !== "string" || fragment === "") {
        return undefined;
      }
      text += fragment;
      return fragment;
    },
    finish(requestedModel) {
      if (!text) {
        throw new ProviderError(`${providerName} streaming response contained no text`, 5);
      }
      return {
        text,
        usage: {
          inputTokens,
          outputTokens,
          reasoningTokens,
          visibleOutputTokens: visibleTokens(outputTokens, reasoningTokens),
        },
        model: model ?? requestedModel,
        finishReason,
      };
    },
  };
}

export async function consumeChatCompletionStream(
  body: ReadableStream<Uint8Array>,
  providerName: string,
  requestedModel: string,
  onDelta?: (chunk: string) => void,
): Promise<ProviderResponse> {
  const accumulator = createChatCompletionAccumulator(providerName);

  for await (const line of streamLines(body)) {
    const fragment = accumulator.consume(line);
    if (fragment !== undefined) {
      onDelta?.(fragment);
    }
  }

  return accumulator.finish(requestedModel);
}

/**
 * Reasoning tokens are billed as output but never shown, so they are removed
 * from the visible count the stats report.
 */
function visibleTokens(total?: number, reasoning?: number): number | undefined {
  if (total === undefined) {
    return undefined;
  }
  return reasoning === undefined ? total : Math.max(0, total - reasoning);
}
