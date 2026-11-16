import type { ProviderRequest, ProviderResponse } from "@/core/types.js";
import { createReasoningFilter } from "@/core/reasoning.js";
import { emptyAnswerError } from "./errors.js";
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
  /** Visible text held back until the stream ended — a tag that never completed. */
  end(): string | undefined;
  finish(requestedModel: string): ProviderResponse;
}

/**
 * Assembles a `chat/completions` stream.
 *
 * Shared by the OpenAI adapter and every OpenAI-compatible one, so the four
 * providers speaking that dialect cannot drift apart.
 *
 * Reasoning written into the content between `<think>` tags is not visible
 * text: it is neither published nor kept (`core/reasoning.ts`). Reasoning a
 * server sends in a field of its own (`reasoning`, `reasoning_content`) was
 * never read as text in the first place.
 */
export function createChatCompletionAccumulator(providerName: string): ChatCompletionAccumulator {
  let text = "";
  let model: string | undefined;
  let finishReason: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let reasoningTokens: number | undefined;
  const reasoning = createReasoningFilter();
  let ended = false;

  const end = (): string | undefined => {
    if (ended) return undefined;
    ended = true;
    const rest = reasoning.flush();
    if (rest === "") return undefined;
    text += rest;
    return rest;
  };

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
      const visible = reasoning.push(fragment);
      if (visible === "") {
        return undefined;
      }
      text += visible;
      return visible;
    },
    end,
    finish(requestedModel) {
      end();
      if (!text) {
        throw emptyAnswerError(
          providerName,
          `${providerName} streaming response contained no text`,
        );
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
  listeners: Pick<ProviderRequest, "onDelta" | "onActivity"> = {},
): Promise<ProviderResponse> {
  const accumulator = createChatCompletionAccumulator(providerName);

  for await (const line of streamLines(body)) {
    // Every line counts, reasoning and keep-alives included: the engine times
    // the server's silence, not the visible text.
    listeners.onActivity?.();
    const fragment = accumulator.consume(line);
    if (fragment !== undefined) {
      listeners.onDelta?.(fragment);
    }
  }

  const rest = accumulator.end();
  if (rest !== undefined) {
    listeners.onDelta?.(rest);
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
