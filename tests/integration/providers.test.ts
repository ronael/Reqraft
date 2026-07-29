import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { AnthropicProvider } from "../../src/providers/anthropic.js";
import { OpenAIProvider } from "../../src/providers/openai.js";
import { MistralProvider } from "../../src/providers/mistral.js";
import { DeepSeekProvider } from "../../src/providers/deepseek.js";

function mockFetch(response: Response): void {
  globalThis.fetch = vi.fn().mockResolvedValue(response);
}

function restoreFetch(): void {
  vi.restoreAllMocks();
}

describe("OpenAI provider", () => {
  beforeEach(() => {
    mockFetch(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"rewritten":"ok"}' }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            completion_tokens_details: { reasoning_tokens: 2 },
          },
          model: "gpt-5-mini",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });
  afterEach(restoreFetch);

  it("sends a GPT-5-compatible payload", async () => {
    const provider = new OpenAIProvider("test-key");
    const result = await provider.generate({
      model: "gpt-5-mini",
      systemPrompt: "sys",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 100,
      stream: false,
      reasoningEffort: "none",
    });

    expect(result.text).toBe('{"rewritten":"ok"}');
    expect(result.model).toBe("gpt-5-mini");
    expect(result.usage?.inputTokens).toBe(10);
    expect(result.usage?.reasoningTokens).toBe(2);
    expect(result.usage?.visibleOutputTokens).toBe(3);

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    if (!call?.[1]) throw new Error("fetch not called");
    const requestUrl = call[0] as string;
    expect(requestUrl).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
    expect(body.model).toBe("gpt-5-mini");
    expect(body.max_completion_tokens).toBe(100);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("does not send unsupported reasoning effort for GPT-5 mini", async () => {
    const provider = new OpenAIProvider("test-key");
    await provider.generate({
      model: "gpt-5-mini",
      systemPrompt: "sys",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 100,
      stream: false,
      reasoningEffort: "none",
    });

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    if (!call?.[1]) throw new Error("fetch not called");
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("temperature");
  });

  it("sends low reasoning effort for GPT-5 mini when requested", async () => {
    const provider = new OpenAIProvider("test-key");
    await provider.generate({
      model: "gpt-5-mini",
      systemPrompt: "sys",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 100,
      stream: false,
      reasoningEffort: "low",
    });

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    if (!call?.[1]) throw new Error("fetch not called");
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
    expect(body.reasoning_effort).toBe("low");
    expect(body).not.toHaveProperty("temperature");
  });

  it("keeps custom GPT-5 family model ids while using safe defaults", async () => {
    const provider = new OpenAIProvider("test-key");
    await provider.generate({
      model: "gpt-5.6-terra",
      systemPrompt: "sys",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 100,
      stream: false,
      reasoningEffort: "none",
    });

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    if (!call?.[1]) throw new Error("fetch not called");
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
    expect(body.model).toBe("gpt-5.6-terra");
    expect(body.max_completion_tokens).toBe(100);
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("keeps temperature for legacy chat models", async () => {
    const provider = new OpenAIProvider("test-key");
    await provider.generate({
      model: "gpt-4o-mini",
      systemPrompt: "sys",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 100,
      stream: false,
    });

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    if (!call?.[1]) throw new Error("fetch not called");
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
    expect(body.temperature).toBe(0.2);
  });
});

describe("Anthropic provider", () => {
  beforeEach(() => {
    mockFetch(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: '{"rewritten":"ok"}' }],
          usage: { input_tokens: 8, output_tokens: 4 },
          model: "claude-haiku-4-5",
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });
  afterEach(restoreFetch);

  it("sends correct payload", async () => {
    const provider = new AnthropicProvider("test-key");
    const result = await provider.generate({
      model: "claude-haiku-4-5",
      systemPrompt: "sys",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 100,
      stream: false,
    });

    expect(result.text).toBe('{"rewritten":"ok"}');
    expect(result.model).toBe("claude-haiku-4-5");

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    if (!call?.[1]) throw new Error("fetch not called");
    const requestUrl = call[0] as string;
    expect(requestUrl).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      temperature: 0.2,
      system: "sys",
      stream: false,
    });
  });

  it("collects text and usage from a streaming Messages response", async () => {
    mockFetch(
      new Response(
        [
          'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":8}}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"rewritten\\":\\"ok"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"\\"}"}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":4},"delta":{"stop_reason":"end_turn"}}\n\n',
        ].join(""),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const provider = new AnthropicProvider("test-key");
    const result = await provider.generate({
      model: "claude-haiku-4-5",
      systemPrompt: "sys",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 100,
      stream: true,
    });

    expect(result).toMatchObject({
      text: '{"rewritten":"ok"}',
      model: "claude-haiku-4-5",
      finishReason: "end_turn",
      usage: { inputTokens: 8, outputTokens: 4, visibleOutputTokens: 4 },
    });
  });

  it("raises a provider error emitted by a streaming response", async () => {
    mockFetch(
      new Response('event: error\ndata: {"type":"error","error":{"message":"overloaded"}}\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const provider = new AnthropicProvider("test-key");
    await expect(
      provider.generate({
        model: "claude-haiku-4-5",
        systemPrompt: "sys",
        userPrompt: "user",
        temperature: 0.2,
        maxOutputTokens: 100,
        stream: true,
      }),
    ).rejects.toThrow("Anthropic streaming error: overloaded");
  });
});

describe("Provider configuration health", () => {
  it("OpenAI reports missing key", async () => {
    const provider = new OpenAIProvider("");
    const health = await provider.validateConfiguration();
    expect(health.ok).toBe(false);
    expect(health.missingConfiguration).toContain("OPENAI_API_KEY");
  });

  it("Mistral reports missing key", async () => {
    const provider = new MistralProvider("");
    const health = await provider.validateConfiguration();
    expect(health.ok).toBe(false);
  });

  it("DeepSeek reports missing key", async () => {
    const provider = new DeepSeekProvider("");
    const health = await provider.validateConfiguration();
    expect(health.ok).toBe(false);
  });
});
