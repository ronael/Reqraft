import { describe, expect, it } from "vitest";
import { rewrite } from "../../src/core/engine.js";
import { cleanProfile } from "../../src/profiles/clean.js";
import { MockProvider } from "../../src/providers/mock.js";

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
});
