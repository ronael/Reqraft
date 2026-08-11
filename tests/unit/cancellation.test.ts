import { describe, expect, it } from "vitest";
import { rewrite } from "../../src/core/engine.js";
import { RequestCancelledError, RequestTimeoutError } from "../../src/core/errors.js";
import { resolveProfile } from "../../src/profiles/registry.js";
import type { ProviderAdapter, ProviderRequest } from "../../src/core/types.js";

/** Provider that never answers until its request is aborted. */
function hangingProvider(): ProviderAdapter {
  return {
    id: "mock",
    name: "Mock",
    validateConfiguration: () => Promise.resolve({ ok: true }),
    generate: (request: ProviderRequest) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener("abort", () => {
          reject(new Error("aborted by signal"));
        });
      }),
  } as unknown as ProviderAdapter;
}

function run(signal: AbortSignal | undefined, timeoutMs: number): Promise<unknown> {
  const { profile } = resolveProfile("clean", "texte");
  return rewrite({
    input: "corrige ce texte",
    profile,
    level: "standard",
    provider: hangingProvider(),
    model: "mock-model",
    includeChanges: true,
    timeoutMs,
    signal,
  });
}

describe("generation cancellation", () => {
  it("reports an interrupt as a cancellation, not as a failure", async () => {
    const controller = new AbortController();
    const pending = run(controller.signal, 30_000);
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(RequestCancelledError);
  });

  it("still reports a timeout when the user did not interrupt", async () => {
    await expect(run(undefined, 20)).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it("prefers the interrupt over the timeout when both fire", async () => {
    const controller = new AbortController();
    const pending = run(controller.signal, 10_000);
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(RequestCancelledError);
  });

  it("carries a message that does not read like an error", async () => {
    const controller = new AbortController();
    const pending = run(controller.signal, 30_000);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ errorCode: "request.cancelled", exitCode: 0 });
  });
});
