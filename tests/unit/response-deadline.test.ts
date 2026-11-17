import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rewrite } from "@/core/engine.js";
import { RequestTimeoutError } from "@/core/errors.js";
import { startResponseDeadline } from "@/core/response-deadline.js";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "@/core/types.js";
import { resolveProfile } from "@/profiles/registry.js";
import { formatUiError } from "@/shared/errors.js";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startResponseDeadline", () => {
  it("gives up when the first token never comes", () => {
    const deadline = startResponseDeadline({ firstTokenMs: 1_000, idleMs: 1_000 });

    vi.advanceTimersByTime(999);
    expect(deadline.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);

    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.expired).toBe("first_token");
    expect(deadline.signal.reason).toMatchObject({ name: "TimeoutError" });
  });

  it("never cuts an answer that keeps arriving, however long it takes", () => {
    const deadline = startResponseDeadline({ firstTokenMs: 1_000, idleMs: 1_000 });

    for (let elapsed = 0; elapsed < 60_000; elapsed += 500) {
      deadline.touch();
      vi.advanceTimersByTime(500);
    }

    expect(deadline.signal.aborted).toBe(false);
    deadline.dispose();
  });

  it("gives up when an answer stops in the middle", () => {
    const deadline = startResponseDeadline({ firstTokenMs: 5_000, idleMs: 1_000 });
    vi.advanceTimersByTime(4_000);
    deadline.touch();

    vi.advanceTimersByTime(1_000);

    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.expired).toBe("idle");
  });

  it("stops the clock once the call settled", () => {
    const deadline = startResponseDeadline({ firstTokenMs: 1_000, idleMs: 1_000 });

    deadline.dispose();
    vi.advanceTimersByTime(10_000);

    expect(deadline.signal.aborted).toBe(false);
    expect(deadline.expired).toBeUndefined();
  });
});

interface SlowStreamOptions {
  fragments: readonly string[];
  intervalMs: number;
  /** Lines of reasoning sent before the answer, which the user never sees. */
  reasoningLines?: number;
  /** The index of the fragment the stream stops before, never to resume. */
  stallAfter?: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

/** Plays the stream; resolves with the answer, or never when it stalls. */
async function play(request: ProviderRequest, options: SlowStreamOptions): Promise<string | null> {
  for (let line = 0; line < (options.reasoningLines ?? 0); line += 1) {
    await wait(options.intervalMs);
    request.onActivity?.();
  }
  for (const [index, fragment] of options.fragments.entries()) {
    if (options.stallAfter === index) return null;
    await wait(options.intervalMs);
    if (request.signal?.aborted) return null;
    request.onDelta?.(fragment);
  }
  return options.fragments.join("");
}

/**
 * A provider that streams `fragments`, one every `intervalMs`, then either
 * finishes or — with `stallAfter` — falls silent until it is aborted.
 */
function slowStream(options: SlowStreamOptions): ProviderAdapter {
  return {
    id: "openai-compatible",
    name: "Ollama",
    local: true,
    validateConfiguration: () => Promise.resolve({ ok: true }),
    generate: (request: ProviderRequest) =>
      new Promise<ProviderResponse>((resolve, reject) => {
        request.signal?.addEventListener("abort", () => {
          reject(request.signal?.reason as Error);
        });
        void play(request, options).then((text) => {
          if (text !== null) resolve({ text, model: request.model });
        });
      }),
  };
}

function runWith(provider: ProviderAdapter, timeoutMs: number): Promise<unknown> {
  return rewrite({
    input: "corrige le bug de connexion",
    profile: resolveProfile("clean").profile,
    level: "minimal",
    provider,
    model: "qwen3.5:4b",
    includeChanges: false,
    stream: true,
    timeoutMs,
  });
}

const ANSWER_FRAGMENTS = [
  '{"rewritten":"Corrige ',
  "le bug ",
  "de ",
  'connexion."',
  ',"warnings":[]}',
];

describe("the engine's deadline", () => {
  it("lets a slow model finish an answer that takes longer than the timeout", async () => {
    const pending = runWith(slowStream({ fragments: ANSWER_FRAGMENTS, intervalMs: 800 }), 1_000);

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toMatchObject({ rewritten: "Corrige le bug de connexion." });
  });

  it("counts reasoning the user never sees as the model answering", async () => {
    const pending = runWith(
      slowStream({ fragments: ANSWER_FRAGMENTS, intervalMs: 800, reasoningLines: 10 }),
      1_000,
    );

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toMatchObject({ rewritten: "Corrige le bug de connexion." });
  });

  it("reports a model that never starts answering as a timeout of its first token", async () => {
    const pending = runWith(slowStream({ fragments: ANSWER_FRAGMENTS, intervalMs: 5_000 }), 1_000);
    const failure = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1_000);

    const error = await failure;
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(error).toMatchObject({ params: { timeoutMs: 1_000, phase: "first_token" } });
    expect(formatUiError(error, "openai-compatible")).toBe(
      "Le provider n’a pas répondu dans le délai de 1000 ms. Un modèle local se charge peut-être encore : réessaie dans un instant. Si cela se répète, augmente le délai de réponse avec « rp config set timeoutMs 120000 ».",
    );
  });

  it("reports a model that stops in the middle of its answer as stalled", async () => {
    const pending = runWith(
      slowStream({ fragments: ANSWER_FRAGMENTS, intervalMs: 500, stallAfter: 2 }),
      1_000,
    );
    const failure = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(3_000);

    const error = await failure;
    expect(error).toMatchObject({ params: { timeoutMs: 1_000, phase: "idle" } });
    expect(formatUiError(error, "openai-compatible")).toBe(
      "Le provider s’est interrompu en pleine réponse : plus rien reçu pendant 1000 ms.",
    );
  });
});
