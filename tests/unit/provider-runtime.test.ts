import { describe, expect, it } from "vitest";
import { resolveProviderRuntime } from "../../src/providers/runtime.js";

describe("provider runtime", () => {
  it("creates a provider adapter and resolves the requested model", () => {
    const runtime = resolveProviderRuntime({
      providerId: "mock",
      requestedModel: "mock-model",
      defaultModel: "fallback-model",
      env: {},
    });

    expect(runtime.providerId).toBe("mock");
    expect(runtime.provider.id).toBe("mock");
    expect(runtime.model).toBe("mock-model");
  });

  it("uses model presets for provider-specific reasoning defaults", () => {
    const runtime = resolveProviderRuntime({
      providerId: "openai",
      requestedModel: "gpt-5-mini-2025-08-07",
      defaultModel: "gpt-4.1-mini",
      env: {},
    });

    expect(runtime.provider.id).toBe("openai");
    expect(runtime.model).toBe("gpt-5-mini-2025-08-07");
    expect(runtime.reasoningEffort).toBe("low");
  });

  it("rejects unknown provider ids before creating adapters", () => {
    expect(() =>
      resolveProviderRuntime({
        providerId: "unknown",
        defaultModel: "mock-model",
        env: {},
      }),
    ).toThrow("Provider non supporté : unknown");
  });
});
