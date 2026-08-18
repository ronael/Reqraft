import { describe, expect, it } from "vitest";
import { createLineSplitter, parseDataLine, streamLines } from "@/providers/sse.js";
import { createStreamAccumulator } from "@/providers/anthropic.js";
import { createChatCompletionAccumulator } from "@/providers/openai-stream.js";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("line splitter", () => {
  it("splits complete lines", () => {
    const split = createLineSplitter();
    expect(split("a\nb\n")).toEqual(["a", "b"]);
  });

  it("holds a partial line until the next chunk completes it", () => {
    const split = createLineSplitter();

    expect(split('data: {"par')).toEqual([]);
    expect(split('tial":true}\n')).toEqual(['data: {"partial":true}']);
  });

  it("flushes the tail when the stream ends without a newline", () => {
    const split = createLineSplitter();

    expect(split("last line")).toEqual([]);
    expect(split(null)).toEqual(["last line"]);
  });

  it("handles CRLF", () => {
    expect(createLineSplitter()("a\r\nb\r\n")).toEqual(["a", "b"]);
  });
});

describe("parseDataLine", () => {
  it("extracts the payload", () => {
    expect(parseDataLine("data: {}")).toBe("{}");
  });

  it("tolerates the absence of a space", () => {
    expect(parseDataLine("data:{}")).toBe("{}");
  });

  it("ignores anything that is not a data line", () => {
    expect(parseDataLine("event: message")).toBeUndefined();
    expect(parseDataLine("")).toBeUndefined();
  });
});

describe("streamLines", () => {
  it("reassembles lines across chunk boundaries", async () => {
    const lines: string[] = [];
    for await (const line of streamLines(streamOf("one\ntw", "o\nthree"))) {
      lines.push(line);
    }
    expect(lines).toEqual(["one", "two", "three"]);
  });
});

describe("anthropic stream accumulator", () => {
  const event = (payload: unknown): string => `data: ${JSON.stringify(payload)}`;

  it("publishes each text fragment as it arrives", () => {
    const accumulator = createStreamAccumulator();
    accumulator.consume(event({ type: "message_start", message: { usage: { input_tokens: 8 } } }));

    const first = accumulator.consume(
      event({ type: "content_block_delta", delta: { type: "text_delta", text: "Bon" } }),
    );
    const second = accumulator.consume(
      event({ type: "content_block_delta", delta: { type: "text_delta", text: "jour" } }),
    );

    expect(first).toBe("Bon");
    expect(second).toBe("jour");
  });

  it("assembles the fragments into the final response", () => {
    const accumulator = createStreamAccumulator();
    accumulator.consume(event({ type: "message_start", message: { usage: { input_tokens: 8 } } }));
    accumulator.consume(
      event({ type: "content_block_delta", delta: { type: "text_delta", text: "Bonjour" } }),
    );
    accumulator.consume(event({ type: "message_delta", usage: { output_tokens: 4 } }));

    const response = accumulator.finish("claude-haiku-4-5");

    expect(response.text).toBe("Bonjour");
    expect(response.usage).toMatchObject({ inputTokens: 8, outputTokens: 4 });
  });

  it("returns nothing for lines that carry no visible text", () => {
    const accumulator = createStreamAccumulator();

    expect(accumulator.consume("event: ping")).toBeUndefined();
    expect(accumulator.consume(event({ type: "ping" }))).toBeUndefined();
  });

  it("surfaces a streaming error instead of silently truncating", () => {
    const accumulator = createStreamAccumulator();

    expect(() =>
      accumulator.consume(event({ type: "error", error: { message: "overloaded" } })),
    ).toThrow("overloaded");
  });

  it("refuses an empty stream rather than returning a blank prompt", () => {
    expect(() => createStreamAccumulator().finish("claude-haiku-4-5")).toThrow();
  });
});

describe("chat completion accumulator", () => {
  const chunk = (payload: unknown): string => `data: ${JSON.stringify(payload)}`;

  it("publishes each content fragment", () => {
    const accumulator = createChatCompletionAccumulator("OpenAI");

    expect(accumulator.consume(chunk({ choices: [{ delta: { content: "Bon" } }] }))).toBe("Bon");
    expect(accumulator.consume(chunk({ choices: [{ delta: { content: "jour" } }] }))).toBe("jour");
  });

  it("ignores the closing sentinel", () => {
    const accumulator = createChatCompletionAccumulator("OpenAI");
    accumulator.consume(chunk({ choices: [{ delta: { content: "ok" } }] }));

    expect(accumulator.consume("data: [DONE]")).toBeUndefined();
    expect(accumulator.finish("gpt-4.1-mini").text).toBe("ok");
  });

  it("ignores the role-only opening chunk", () => {
    const accumulator = createChatCompletionAccumulator("OpenAI");

    expect(accumulator.consume(chunk({ choices: [{ delta: {} }] }))).toBeUndefined();
  });

  it("collects usage from the trailing chunk", () => {
    const accumulator = createChatCompletionAccumulator("OpenAI");
    accumulator.consume(chunk({ model: "gpt-4.1-mini", choices: [{ delta: { content: "ok" } }] }));
    accumulator.consume(
      chunk({
        choices: [],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 30,
          completion_tokens_details: { reasoning_tokens: 8 },
        },
      }),
    );

    const response = accumulator.finish("fallback");

    expect(response.model).toBe("gpt-4.1-mini");
    expect(response.usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 30,
      reasoningTokens: 8,
      // Reasoning tokens are billed but never shown, so they leave the visible count.
      visibleOutputTokens: 22,
    });
  });

  it("keeps the visible count equal to the total when nothing was reasoned", () => {
    const accumulator = createChatCompletionAccumulator("OpenAI");
    accumulator.consume(chunk({ choices: [{ delta: { content: "ok" } }] }));
    accumulator.consume(chunk({ choices: [], usage: { completion_tokens: 12 } }));

    expect(accumulator.finish("m").usage?.visibleOutputTokens).toBe(12);
  });

  it("records why the stream stopped", () => {
    const accumulator = createChatCompletionAccumulator("OpenAI");
    accumulator.consume(chunk({ choices: [{ delta: { content: "ok" } }] }));
    accumulator.consume(chunk({ choices: [{ delta: {}, finish_reason: "stop" }] }));

    expect(accumulator.finish("m").finishReason).toBe("stop");
  });

  it("refuses an empty stream rather than returning a blank prompt", () => {
    expect(() => createChatCompletionAccumulator("OpenAI").finish("m")).toThrow();
  });
});
