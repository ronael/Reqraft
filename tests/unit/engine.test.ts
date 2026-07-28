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

class ExpandingProvider implements ProviderAdapter {
  readonly id = "expanding";
  readonly name = "Expanding";

  generate(): Promise<ProviderResponse> {
    return Promise.resolve({
      text: JSON.stringify({
        rewritten: "Crée une landing page avec un header, des témoignages, une FAQ, un footer, une palette détaillée, une section pricing, des animations, une stratégie SEO, une navigation responsive, des critères de performance, une base de données, un système d'authentification et plusieurs sections produit détaillées.",
        warnings: [],
      }),
      usage: { inputTokens: 10, outputTokens: 30, visibleOutputTokens: 30 },
      model: "mock-model",
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

    expect(provider.request?.maxOutputTokens).toBe(900);
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

  it("adds fidelity warnings for unsupported additions", async () => {
    const result = await rewrite({
      input: "fais une landing page style apple",
      profile: webDesignProfile,
      level: "standard",
      provider: new ExpandingProvider(),
      model: "mock-model",
      includeChanges: false,
      fidelityMode: "permissive",
    });

    expect(result.warnings.join("\n")).toContain("Potential unsupported additions");
    expect(result.warnings.join("\n")).toContain("témoignages");
  });

  it("blocks disproportionate expansions in balanced fidelity mode", async () => {
    await expect(
      rewrite({
        input: "fais une landing page style apple",
        profile: webDesignProfile,
        level: "standard",
        provider: new ExpandingProvider(),
        model: "mock-model",
        includeChanges: false,
        fidelityMode: "balanced",
      }),
    ).rejects.toThrow("expansion disproportionnée");
  });

  it("blocks unsupported additions in strict fidelity mode", async () => {
    await expect(
      rewrite({
        input: "fais une landing page style apple",
        profile: webDesignProfile,
        level: "standard",
        provider: new ExpandingProvider(),
        model: "mock-model",
        includeChanges: false,
        fidelityMode: "strict",
      }),
    ).rejects.toThrow("ajouts non supportés");
  });
});
