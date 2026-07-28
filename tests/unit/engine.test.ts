import { describe, expect, it } from "vitest";
import { rewrite } from "../../src/core/engine.js";
import { cleanProfile } from "../../src/profiles/clean.js";
import { webDesignProfile } from "../../src/profiles/web-design.js";
import { MockProvider } from "../../src/providers/mock.js";
import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderRequest,
  ProviderResponse,
} from "../../src/core/types.js";

class CaptureProvider implements ProviderAdapter {
  readonly id = "capture";
  readonly name = "Capture";
  request?: ProviderRequest;

  generate(request: ProviderRequest): Promise<ProviderResponse> {
    this.request = request;
    return Promise.resolve({
      text: JSON.stringify({ rewritten: "ok", warnings: [] }),
      usage: { inputTokens: 1, outputTokens: 1 },
      model: request.model,
    });
  }

  validateConfiguration(): Promise<ProviderHealth> {
    return Promise.resolve({ ok: true, message: "ok" });
  }
}

class EmptyProvider implements ProviderAdapter {
  readonly id = "empty";
  readonly name = "Empty";

  generate(): Promise<ProviderResponse> {
    return Promise.resolve({
      text: "",
      usage: { inputTokens: 231, outputTokens: 450, reasoningTokens: 450, visibleOutputTokens: 0 },
      model: "gpt-5-mini",
      finishReason: "length",
    });
  }

  validateConfiguration(): Promise<ProviderHealth> {
    return Promise.resolve({ ok: true, message: "ok" });
  }
}

describe("engine", () => {
  it("rewrites input using mock provider", async () => {
    const result = await rewrite({
      input: "corrige ça",
      profile: cleanProfile,
      level: "standard",
      provider: new MockProvider(),
      model: "mock-model",
      includeChanges: true,
    });

    expect(result.original).toBe("corrige ça");
    expect(result.profile).toBe("clean");
    expect(result.level).toBe("standard");
    expect(result.provider).toBe("mock");
    expect(result.rewritten).toContain("[mock]");
    expect(result.changes.length).toBeGreaterThan(0);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("uses smaller output budgets by level", async () => {
    const provider = new CaptureProvider();

    await rewrite({
      input: "je voudrais que me crée une landing page style apple en respectant les convention",
      profile: webDesignProfile,
      level: "standard",
      provider,
      model: "mock-model",
      includeChanges: false,
    });

    expect(provider.request?.maxOutputTokens).toBe(450);
  });

  it("rejects empty provider responses", async () => {
    await expect(
      rewrite({
        input: "test",
        profile: cleanProfile,
        level: "standard",
        provider: new EmptyProvider(),
        model: "gpt-5-mini",
        includeChanges: false,
      }),
    ).rejects.toThrow("sans produire de texte visible");
  });
});
