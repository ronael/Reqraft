import { describe, expect, it } from "vitest";
import {
  formatDiff,
  formatExplain,
  formatQuality,
  formatStats,
} from "../../src/commands/reprompt.js";
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
    quality: { status: "good", signals: [] },
    ...overrides,
  };
}

describe("CLI output formatting", () => {
  it("uses semantic Reqraft colours for the quick diff view", () => {
    const output = formatDiff("ancien texte", "nouveau texte", { color: true });

    expect(output).toContain("\u001b[38;2;251;113;133m- ancien texte\u001b[0m");
    expect(output).toContain("\u001b[38;2;52;211;153m+ nouveau texte\u001b[0m");
  });

  it("gives explanations a contrasted heading and visible bullets", () => {
    const output = formatExplain(makeResult({ changes: ["Clarification du périmètre"] }), {
      color: true,
    });

    expect(output).toContain("\u001b[1;38;2;167;139;250mModifications\u001b[0m");
    expect(output).toContain("\u001b[38;2;167;139;250m›\u001b[0m Clarification du périmètre");
  });

  it("separates stats labels from their values while keeping plain text pipeable", () => {
    const result = makeResult({ latencyMs: 1_240 });
    const colored = formatStats(result, { color: true });
    const plain = formatStats(result, { color: false });

    expect(colored).toContain("\u001b[1;38;2;167;139;250mStats\u001b[0m");
    expect(colored).toContain("\u001b[2mDurée\u001b[0m 1.24 s");
    expect(plain).toContain("Durée 1.24 s");
    expect(plain).not.toContain("\u001b[");
  });

  it("keeps quality in stats when no detailed warning block is printed", () => {
    expect(formatStats(makeResult())).toContain("Qualité correcte");
  });

  it("does not repeat quality in stats after detailed warnings", () => {
    const result = makeResult({
      quality: {
        status: "review",
        signals: [
          {
            code: "model_warning",
            severity: "warning",
            detail: "Ambiguïté critique.",
          },
        ],
      },
    });

    expect(formatQuality(result)).toContain("Qualité à vérifier");
    expect(formatStats(result, { includeQuality: false })).not.toContain("Qualité à vérifier");
  });

  it("visually separates a quality warning from the generated prompt", () => {
    const result = makeResult({
      quality: {
        status: "review",
        signals: [
          {
            code: "model_warning",
            severity: "warning",
            detail: "Le composant cible reste ambigu.",
          },
        ],
      },
    });
    const output = formatQuality(result, { color: true, unicode: true });

    expect(output).toContain("\u001b[2m────────────────────────────────────────\u001b[0m");
    expect(output).toContain("\u001b[1;38;2;251;191;36mQualité à vérifier\u001b[0m");
    expect(output).toContain("\u001b[38;2;251;191;36m!\u001b[0m Le composant cible reste ambigu.");
  });
});
