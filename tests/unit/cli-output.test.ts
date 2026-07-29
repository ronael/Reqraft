import { describe, expect, it } from "vitest";
import { formatQuality, formatStats } from "../../src/commands/reprompt.js";
import type { RepromptResult } from "../../src/core/types.js";

function makeResult(overrides: Partial<RepromptResult> = {}): RepromptResult {
  return {
    original: "test",
    rewritten: "Test.",
    profile: "clean",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: [],
    warnings: [],
    quality: { status: "good", signals: [] },
    ...overrides,
  };
}

describe("CLI output formatting", () => {
  it("keeps quality in stats when no detailed warning block is printed", () => {
    expect(formatStats(makeResult())).toContain("Qualité correcte");
  });

  it("does not repeat quality in stats after detailed warnings", () => {
    const result = makeResult({
      warnings: ["Ambiguïté critique."],
      quality: {
        status: "review",
        signals: [
          {
            code: "model_warning",
            severity: "warning",
            message: "Ambiguïté critique.",
          },
        ],
      },
    });

    expect(formatQuality(result)).toContain("Qualité à vérifier");
    expect(formatStats(result, { includeQuality: false })).not.toContain("Qualité à vérifier");
  });
});
