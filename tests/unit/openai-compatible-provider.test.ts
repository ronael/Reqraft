import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderRequest } from "@/core/types.js";
import {
  OpenAICompatibleProvider,
  type OpenAICompatibleOptions,
} from "@/providers/openai-compatible.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

const LOCAL_BASE_URL = "http://localhost:11434/v1";
const ANSWER = {
  choices: [{ message: { role: "assistant", content: "Fix the login bug." } }],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A local OpenAI-compatible server, such as Ollama, with no key by default. */
function localServer(options: Partial<OpenAICompatibleOptions> = {}): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider("Ollama", { baseUrl: LOCAL_BASE_URL, ...options });
}

function rewriteRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    model: "llama3.2",
    systemPrompt: "Rewrite the user's request as a clear prompt.",
    userPrompt: "fix login bug pls",
    temperature: 0.2,
    maxOutputTokens: 800,
    stream: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A server-sent event body delivered in the network chunks given. */
function eventStream(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

interface SentRequest {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal | null | undefined;
}

/** What the adapter put on the wire, with header names normalised as HTTP does. */
function sentRequest(): SentRequest {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  if (typeof url !== "string") throw new Error("no request was sent");
  return {
    url,
    method: init?.method,
    headers: Object.fromEntries(new Headers(init?.headers)),
    body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
    signal: init?.signal,
  };
}

describe("OpenAI-compatible completions", () => {
  it("posts the conversation to the base URL and returns the answer", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: "llama3.2:latest",
        choices: [
          { message: { role: "assistant", content: "Fix the login bug." }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 42, completion_tokens: 6 },
      }),
    );

    const result = await localServer().generate(rewriteRequest());

    expect(result).toEqual({
      text: "Fix the login bug.",
      usage: { inputTokens: 42, outputTokens: 6 },
      model: "llama3.2:latest",
      finishReason: "stop",
    });
    const sent = sentRequest();
    expect(sent.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(sent.method).toBe("POST");
    expect(sent.body).toEqual({
      model: "llama3.2",
      messages: [
        { role: "system", content: "Rewrite the user's request as a clear prompt." },
        { role: "user", content: "fix login bug pls" },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });
  });

  it("calls a local server without any Authorization header", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ANSWER));

    await localServer().generate(rewriteRequest());

    expect(sentRequest().headers).toEqual({ "content-type": "application/json" });
  });

  it("authenticates with the API key as a bearer token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ANSWER));

    await localServer({ apiKey: "gateway-test-key" }).generate(rewriteRequest());

    expect(sentRequest().headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer gateway-test-key",
    });
  });

  it("sends the gateway's custom headers with the completion", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ANSWER));

    await localServer({
      customHeaders: { "api-key": "azure-test-key", "X-Title": "Reqraft" },
    }).generate(rewriteRequest());

    expect(sentRequest().headers).toEqual({
      "content-type": "application/json",
      "api-key": "azure-test-key",
      "x-title": "Reqraft",
    });
  });

  it("lets the configured API key win over a custom Authorization header", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ANSWER));

    await localServer({
      apiKey: "current-test-key",
      customHeaders: { Authorization: "Bearer stale-test-key" },
    }).generate(rewriteRequest());

    expect(sentRequest().headers.authorization).toBe("Bearer current-test-key");
  });

  it("asks for JSON output and adds the provider's extra body fields", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ANSWER));

    await localServer({
      responseFormat: { type: "json_object" },
      extraBody: { thinking: { type: "disabled" } },
    }).generate(rewriteRequest());

    expect(sentRequest().body).toMatchObject({
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
    });
  });

  it("leaves usage, model and finish reason unreported when the server omits them", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ANSWER));

    await expect(localServer().generate(rewriteRequest())).resolves.toEqual({
      text: "Fix the login bug.",
      usage: {},
    });
  });

  it("rejects an answer without any choice", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [] }));

    await expect(localServer().generate(rewriteRequest())).rejects.toThrow(
      "OpenAI-compatible endpoint returned no choices",
    );
  });

  it("passes the caller's abort signal to the request", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ANSWER));
    const controller = new AbortController();

    await localServer().generate(rewriteRequest({ signal: controller.signal }));

    expect(sentRequest().signal).toBe(controller.signal);
  });

  it("keeps a cancelled request a cancellation", async () => {
    const abort = new DOMException("This operation was aborted", "AbortError");
    fetchMock.mockRejectedValue(abort);

    await expect(localServer().generate(rewriteRequest())).rejects.toBe(abort);
  });

  it("names the server it could not reach", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(localServer().generate(rewriteRequest())).rejects.toMatchObject({
      name: "ProviderError",
      errorCode: "provider.request_failed",
      exitCode: EXIT_CODES.PROVIDER_NETWORK,
      params: { provider: "Ollama" },
    });
  });

  it("reaches /chat/completions when the base URL ends with a slash", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ANSWER));

    await localServer({ baseUrl: `${LOCAL_BASE_URL}/` }).generate(rewriteRequest());

    expect(sentRequest().url).toBe("http://localhost:11434/v1/chat/completions");
  });
});

describe("OpenAI-compatible HTTP errors", () => {
  it.each([
    {
      status: 401,
      errorCode: "provider.authentication_failed",
      exitCode: EXIT_CODES.AUTHENTICATION,
    },
    {
      status: 403,
      errorCode: "provider.authentication_failed",
      exitCode: EXIT_CODES.AUTHENTICATION,
    },
    {
      status: 402,
      errorCode: "provider.insufficient_credit",
      exitCode: EXIT_CODES.PROVIDER_NETWORK,
    },
    { status: 429, errorCode: "provider.rate_limited", exitCode: EXIT_CODES.PROVIDER_NETWORK },
    { status: 503, errorCode: "provider.unavailable", exitCode: EXIT_CODES.PROVIDER_NETWORK },
    { status: 404, errorCode: "provider.request_failed", exitCode: EXIT_CODES.PROVIDER_NETWORK },
  ])("turns HTTP $status into $errorCode", async ({ status, errorCode, exitCode }) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "denied" } }, status));

    await expect(localServer().generate(rewriteRequest())).rejects.toMatchObject({
      name: "ProviderError",
      errorCode,
      exitCode,
      httpStatus: status,
      params: { provider: "openai-compatible", httpStatus: status },
    });
  });

  it("reports the HTTP error before reading a requested stream", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "slow down" } }, 429));
    const onDelta = vi.fn();

    await expect(
      localServer().generate(rewriteRequest({ stream: true, onDelta })),
    ).rejects.toMatchObject({ errorCode: "provider.rate_limited", httpStatus: 429 });
    expect(onDelta).not.toHaveBeenCalled();
  });
});

describe("OpenAI-compatible streaming", () => {
  it("forwards each fragment as it arrives and assembles the answer", async () => {
    fetchMock.mockResolvedValue(
      eventStream([
        'data: {"model":"llama3.2:latest","choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Fix the "}}]}\n\ndata: {"choices":[{"del',
        'ta":{"content":"login bug."},"finish_reason":"stop"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":42,"completion_tokens":6}}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const fragments: string[] = [];

    const result = await localServer().generate(
      rewriteRequest({
        stream: true,
        onDelta: (fragment) => {
          fragments.push(fragment);
        },
      }),
    );

    expect(fragments).toEqual(["Fix the ", "login bug."]);
    expect(result).toEqual({
      text: "Fix the login bug.",
      usage: { inputTokens: 42, outputTokens: 6, visibleOutputTokens: 6 },
      model: "llama3.2:latest",
      finishReason: "stop",
    });
    expect(sentRequest().body).toMatchObject({ stream: true });
    expect(sentRequest().body).not.toHaveProperty("stream_options");
  });

  it("falls back to the requested model when the stream does not name one", async () => {
    fetchMock.mockResolvedValue(
      eventStream(['data: {"choices":[{"delta":{"content":"Fix it."}}]}\n\n', "data: [DONE]\n\n"]),
    );

    const result = await localServer().generate(rewriteRequest({ stream: true }));

    expect(result).toMatchObject({ text: "Fix it.", model: "llama3.2" });
  });

  it("rejects a stream that carries no text", async () => {
    fetchMock.mockResolvedValue(
      eventStream([
        'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":"length"}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const onDelta = vi.fn();

    await expect(localServer().generate(rewriteRequest({ stream: true, onDelta }))).rejects.toThrow(
      "Ollama streaming response contained no text",
    );
    expect(onDelta).not.toHaveBeenCalled();
  });

  // Bug, left unfixed: that rejection is a ProviderError without HTTP status,
  // which maps to provider.request_failed, so the user is told the server is
  // unreachable instead of seeing the empty-result message.
  it.todo("reports a stream without text as an empty result, not as a network failure");
});

describe("OpenAI-compatible model listing", () => {
  it("lists the models a local server offers, without credentials", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ object: "list", data: [{ id: "llama3.2" }, { id: "qwen3:8b" }] }),
    );
    const controller = new AbortController();

    await expect(localServer().listModels(controller.signal)).resolves.toEqual([
      { id: "llama3.2", name: "llama3.2", provider: "openai-compatible" },
      { id: "qwen3:8b", name: "qwen3:8b", provider: "openai-compatible" },
    ]);
    const sent = sentRequest();
    expect(sent.url).toBe("http://localhost:11434/v1/models");
    expect(sent.headers).toEqual({});
    expect(sent.signal).toBe(controller.signal);
  });

  it("reaches /models when the base URL ends with a slash", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ object: "list", data: [] }));

    await localServer({ baseUrl: `${LOCAL_BASE_URL}//` }).listModels();

    expect(sentRequest().url).toBe("http://localhost:11434/v1/models");
  });

  it("authenticates the listing with the API key", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ object: "list", data: [] }));

    await localServer({ apiKey: "gateway-test-key" }).listModels();

    expect(sentRequest().headers).toEqual({ authorization: "Bearer gateway-test-key" });
  });

  it("turns a rejected listing into an authentication error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));

    await expect(localServer().listModels()).rejects.toMatchObject({
      errorCode: "provider.authentication_failed",
      httpStatus: 401,
    });
  });

  // Bug, left unfixed: listModels sends only the Authorization header, so a
  // gateway that authenticates through customHeaders rejects the listing
  // while completions to the same gateway succeed.
  it.todo("sends the custom headers when listing models, as completions do");
});

describe("OpenAI-compatible configuration check", () => {
  it("reports a missing base URL", async () => {
    await expect(
      new OpenAICompatibleProvider("Custom", { baseUrl: "" }).validateConfiguration(),
    ).resolves.toEqual({
      ok: false,
      code: "missing_configuration",
      missingConfiguration: ["baseUrl"],
    });
  });

  it("accepts a local server without an API key, offline", async () => {
    await expect(localServer().validateConfiguration()).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
