import { describe, expect, it, vi } from "vitest";
import { executeReprompt } from "../../src/application/reprompt.js";

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
      { hydrateCredentials },
    );

    expect(hydrateCredentials).toHaveBeenCalledOnce();
    expect(result.rewritten).toContain("[mock] corrige ça");
    expect(result.changes).toEqual(["Mock reformulation applied"]);
    expect(detectedProfile).toBe(false);
  });

  it("returns auto profile detection metadata to callers", async () => {
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
      { hydrateCredentials: vi.fn().mockResolvedValue(undefined) },
    );

    expect(result.profile).toBe("frontend");
    expect(detectedProfile).toBe(true);
  });
});
