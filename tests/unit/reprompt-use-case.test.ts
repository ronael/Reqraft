import { describe, expect, it, vi } from "vitest";
import { executeReprompt } from "../../src/application/reprompt.js";
import { MockProvider } from "../../src/providers/mock.js";
import type { EngineOptions } from "../../src/core/engine.js";
import type { RepromptResult } from "../../src/core/types.js";

function makeResult(overrides: Partial<RepromptResult> = {}): RepromptResult {
  return {
    original: "input",
    rewritten: "output",
    profile: "clean",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: [],
    quality: { status: "good", signals: [] },
    ...overrides,
  };
}

describe("reprompt use case", () => {
  it("executes the shared generation path with mock provider", async () => {
    const hydrateCredentials = vi.fn().mockResolvedValue(undefined);

    const { result, detectedProfile } = await executeReprompt(
      {
        input: "corrige ça",
        profileId: "clean",
        level: "standard",
        providerId: "mock",
        requestedModel: "mock-model",
        defaultModel: "mock-model",
        env: {},
      },
      {
        hydrateCredentials,
        resolveProviderRuntime: (input) => ({
          providerId: "mock",
          provider: new MockProvider(),
          model: input.requestedModel ?? input.defaultModel,
        }),
        rewrite: (options) =>
          Promise.resolve(
            makeResult({
              original: options.input,
              rewritten: `[mock] ${options.input}`,
              profile: options.profile === "auto" ? "auto" : options.profile.id,
              changes: ["Mock reformulation applied"],
            }),
          ),
      },
    );

    expect(hydrateCredentials).toHaveBeenCalledOnce();
    expect(result.rewritten).toContain("[mock] corrige ça");
    expect(result.changes).toEqual(["Mock reformulation applied"]);
    expect(detectedProfile).toBe(false);
  });

  it("returns auto profile detection metadata to callers", async () => {
    // Detection now happens inside the same generation call, not as a local,
    // synchronous pre-step: the fake `rewrite` below stands in for "the model,
    // given the auto-detect prompt, decided frontend and reported it" — see
    // core/prompt-builder.ts#buildAutoDetectPrompt and
    // core/result-parser.ts#resolveDetectedProfileId.
    let capturedProfile: EngineOptions["profile"] | undefined;

    const { result, detectedProfile } = await executeReprompt(
      {
        input: "corrige Dashboard.tsx",
        profileId: "auto",
        level: "standard",
        providerId: "mock",
        requestedModel: "mock-model",
        defaultModel: "mock-model",
        env: {},
      },
      {
        hydrateCredentials: vi.fn().mockResolvedValue(undefined),
        resolveProviderRuntime: (input) => ({
          providerId: "mock",
          provider: new MockProvider(),
          model: input.requestedModel ?? input.defaultModel,
        }),
        rewrite: (options) => {
          capturedProfile = options.profile;
          return Promise.resolve(makeResult({ profile: "frontend" }));
        },
      },
    );

    expect(capturedProfile).toBe("auto");
    expect(result.profile).toBe("frontend");
    expect(detectedProfile).toBe(true);
  });

  it("propagates stream preference to the engine options", async () => {
    let captured: EngineOptions | undefined;

    await executeReprompt(
      {
        input: "corrige ça",
        profileId: "clean",
        level: "standard",
        providerId: "mock",
        requestedModel: "mock-model",
        defaultModel: "mock-model",
        env: {},
        stream: true,
      },
      {
        hydrateCredentials: vi.fn().mockResolvedValue(undefined),
        resolveProviderRuntime: () => ({
          providerId: "mock",
          provider: new MockProvider(),
          model: "mock-model",
        }),
        rewrite: (options) => {
          captured = options;
          return Promise.resolve(makeResult());
        },
      },
    );

    expect(captured?.stream).toBe(true);
  });
});
