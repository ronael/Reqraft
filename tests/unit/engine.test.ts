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
        rewritten:
          "Crée une landing page avec un header, des témoignages, une FAQ, un footer, une palette détaillée, une section pricing, des animations, une stratégie SEO, une navigation responsive, des critères de performance, une base de données, un système d'authentification et plusieurs sections produit détaillées. Ajoute aussi un espace administrateur, des notifications, un programme de fidélité, une gestion multilingue, des tableaux de bord analytiques, un moteur de recherche et une documentation complète du déploiement.",
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

class TruncatedProvider implements ProviderAdapter {
  readonly id = "truncated";
  readonly name = "Truncated";

  generate(): Promise<ProviderResponse> {
    return Promise.resolve({
      text: JSON.stringify({
        rewritten: "Voici la partie exploitable de la reformulation.",
        warnings: [],
      }),
      usage: { inputTokens: 20, outputTokens: 50, visibleOutputTokens: 50 },
      model: "mock-model",
      finishReason: "length",
    });
  }

  validateConfiguration(): Promise<ProviderHealth> {
    return Promise.resolve({ ok: true, message: "ok" });
  }
}

class WaitingProvider implements ProviderAdapter {
  readonly id = "waiting";
  readonly name = "Waiting";

  generate(request: ProviderRequest): Promise<ProviderResponse> {
    return new Promise((_resolve, reject) => {
      request.signal?.addEventListener(
        "abort",
        () => {
          reject(new Error(String(request.signal?.reason)));
        },
        { once: true },
      );
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

  it("resolves an output budget from the centralized generation policy", async () => {
    const provider = new CaptureProvider();

    await rewrite({
      input: "je voudrais que me crée une landing page style apple en respectant les convention",
      profile: webDesignProfile,
      level: "standard",
      provider,
      model: "mock-model",
      includeChanges: false,
    });

    expect(provider.request?.maxOutputTokens).toBeGreaterThan(0);
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

  it("keeps permissive fidelity findings as non-blocking information", async () => {
    const result = await rewrite({
      input: "fais une landing page style apple",
      profile: webDesignProfile,
      level: "standard",
      provider: new ExpandingProvider(),
      model: "mock-model",
      includeChanges: false,
      fidelityMode: "permissive",
    });

    expect(result.warnings).toEqual([]);
    expect(result.quality.signals).toContainEqual(
      expect.objectContaining({
        code: "unsupported_additions",
        severity: "info",
      }),
    );
  });

  it("returns disproportionate expansions with a review signal in balanced mode", async () => {
    const result = await rewrite({
      input: "fais une landing page style apple",
      profile: webDesignProfile,
      level: "standard",
      provider: new ExpandingProvider(),
      model: "mock-model",
      includeChanges: false,
      fidelityMode: "balanced",
    });

    expect(result.rewritten).toContain("Crée une landing page");
    expect(result.quality.status).toBe("review");
    expect(result.quality.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "disproportionate_expansion",
          severity: "warning",
        }),
      ]),
    );
  });

  it("returns strict-mode results with explicit unsupported-addition signals", async () => {
    const result = await rewrite({
      input: "fais une landing page style apple",
      profile: webDesignProfile,
      level: "standard",
      provider: new ExpandingProvider(),
      model: "mock-model",
      includeChanges: false,
      fidelityMode: "strict",
    });

    expect(result.rewritten).toContain("Crée une landing page");
    expect(result.quality.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported_additions",
          severity: "warning",
        }),
      ]),
    );
  });

  it("keeps a parseable truncated response and marks it as risky", async () => {
    const result = await rewrite({
      input: "rédige une architecture détaillée",
      profile: cleanProfile,
      level: "complete",
      provider: new TruncatedProvider(),
      model: "mock-model",
      includeChanges: false,
    });

    expect(result.rewritten).toContain("partie exploitable");
    expect(result.quality.status).toBe("risky");
    expect(result.quality.signals).toContainEqual(
      expect.objectContaining({ code: "output_truncated", severity: "critical" }),
    );
  });

  it("aborts provider work when the configured timeout expires", async () => {
    await expect(
      rewrite({
        input: "test timeout",
        profile: cleanProfile,
        level: "standard",
        provider: new WaitingProvider(),
        model: "mock-model",
        includeChanges: false,
        timeoutMs: 10,
      }),
    ).rejects.toThrow("10 ms");
  });
});
