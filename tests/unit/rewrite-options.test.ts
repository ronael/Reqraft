import { describe, expect, it } from "vitest";
import { prepareRewriteOptions } from "@/core/rewrite-options.js";
import { cleanProfile } from "@/profiles/clean.js";
import { MockProvider } from "@/providers/mock.js";

describe("rewrite options contract", () => {
  it("always asks providers for changes so CLI and TUI share the same prompt contract", () => {
    const options = prepareRewriteOptions({
      input: "bonjour voici les docs pour la campagne, cordialement",
      profile: cleanProfile,
      level: "standard",
      provider: new MockProvider(),
      model: "mock-model",
    });

    expect(options.includeChanges).toBe(true);
  });
});
