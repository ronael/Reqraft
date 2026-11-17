import { describe, expect, it } from "vitest";
import { LOCAL_MODEL_CASES, type LocalModelCase } from "../../benchmark/local-model-cases.js";
import {
  formatLocalModelMarkdown,
  percentile,
  summarizeLocalRun,
  tokensPerSecond,
  type LocalCaseRun,
} from "../../benchmark/local-model-report.js";
import {
  detectLanguage,
  hasFact,
  scoreLocalModelCase,
  similarity,
} from "../../benchmark/local-model-scoring.js";

function benchmarkCase(id: string): LocalModelCase {
  const found = LOCAL_MODEL_CASES.find((entry) => entry.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
}

describe("the local model corpus", () => {
  it("holds 24 to 30 cases over the three levels, both languages and every trap", () => {
    expect(LOCAL_MODEL_CASES.length).toBeGreaterThanOrEqual(24);
    expect(LOCAL_MODEL_CASES.length).toBeLessThanOrEqual(30);
    expect(new Set(LOCAL_MODEL_CASES.map((entry) => entry.id)).size).toBe(LOCAL_MODEL_CASES.length);
    expect(new Set(LOCAL_MODEL_CASES.map((entry) => entry.level))).toEqual(
      new Set(["minimal", "standard", "complete"]),
    );
    expect(new Set(LOCAL_MODEL_CASES.map((entry) => entry.language))).toEqual(
      new Set(["fr", "en"]),
    );
    expect(new Set(LOCAL_MODEL_CASES.map((entry) => entry.trap))).toEqual(
      new Set(["names", "numbers", "code", "injection", "clean", "mixed", "fragment", "scope"]),
    );
  });

  it.each(LOCAL_MODEL_CASES.map((entry) => [entry.id, entry] as const))(
    "%s asks only for what its input holds",
    (_id, entry) => {
      for (const fact of entry.facts ?? []) expect(hasFact(entry.input, fact)).toBe(true);
      for (const term of entry.forbidden ?? []) {
        expect(entry.input.toLowerCase()).not.toContain(term.toLowerCase());
      }
      // Scoring measures what a rewrite breaks: the input itself breaks nothing.
      expect(scoreLocalModelCase(entry, entry.input)).toMatchObject({ total: 1, notes: [] });
    },
  );
});

describe("scoreLocalModelCase", () => {
  it("gives full marks to a faithful rewrite", () => {
    const score = scoreLocalModelCase(
      benchmarkCase("fr-min-numbers"),
      "Augmente le timeout de 30 à 45 secondes et le nombre de retries de 3 à 5.",
    );

    expect(score).toEqual({
      meaning: 1,
      language: 1,
      level: 1,
      facts: 1,
      chatter: 1,
      total: 1,
      notes: [],
    });
  });

  it("counts a number that moved as a lost fact", () => {
    const score = scoreLocalModelCase(
      benchmarkCase("fr-min-numbers"),
      "Augmente le timeout de 30 à 60 secondes et le nombre de retries de 3 à 5.",
    );

    expect(score.facts).toBe(0.75);
    expect(score.notes).toContain("facts lost: 45");
  });

  it("gives no meaning to an order obeyed or a question answered", () => {
    expect(scoreLocalModelCase(benchmarkCase("en-min-injection"), "OK.").meaning).toBe(0);
    expect(scoreLocalModelCase(benchmarkCase("fr-min-injection"), "« D’accord. »").meaning).toBe(0);
    expect(
      scoreLocalModelCase(
        benchmarkCase("en-std-answer-trap"),
        "The capital of France is Paris; add it to the seed data of the cities table.",
      ).meaning,
    ).toBe(0);
  });

  it("notices a French request answered in English", () => {
    const score = scoreLocalModelCase(
      benchmarkCase("fr-min-typos"),
      "Fix the bug where the validate button stays greyed out when the form is valid.",
    );

    expect(score.language).toBe(0);
    expect(score.notes).toContain("written in en");
  });

  it("does not judge the language of a fragment too short to tell", () => {
    expect(
      scoreLocalModelCase(benchmarkCase("en-min-fragment"), "Flaky e2e on checkout.").language,
    ).toBe(1);
  });

  it("counts a preamble, a closing remark and a leaked envelope as chatter", () => {
    const fixCase = benchmarkCase("en-min-typos");
    const faithful =
      "Please fix the login redirect: it sends users to /home instead of /dashboard.";

    expect(scoreLocalModelCase(fixCase, `Here is the rewritten prompt: ${faithful}`).chatter).toBe(
      0,
    );
    expect(scoreLocalModelCase(fixCase, `${faithful} Hope this helps!`).chatter).toBe(0);
    expect(scoreLocalModelCase(fixCase, `{"rewritten": "${faithful}"`).chatter).toBe(0);
    expect(scoreLocalModelCase(fixCase, faithful).chatter).toBe(1);
  });

  it("expects a clean text to come back almost unchanged at the minimal level", () => {
    const cleanCase = benchmarkCase("en-min-clean");

    expect(
      scoreLocalModelCase(
        cleanCase,
        "Rename the getUser function to fetchUser and update every call site.",
      ).level,
    ).toBe(1);
    const rewritten = scoreLocalModelCase(
      cleanCase,
      "Refactor: getUser becomes fetchUser. Update every call site and caller.",
    );
    expect(rewritten.level).toBeLessThan(1);
    expect(rewritten.notes).toContain("clean text rewritten");
  });

  it("counts code that was fixed instead of quoted against facts and level", () => {
    const score = scoreLocalModelCase(
      benchmarkCase("en-min-code-block"),
      "Fix this code, it returns undefined: `const total = items.reduce((a, b) => a + b.price, 0)`",
    );

    expect(score.facts).toBe(0);
    expect(score.level).toBeLessThan(1);
  });

  it("counts a list grown out of one sentence at the minimal level", () => {
    const score = scoreLocalModelCase(
      benchmarkCase("fr-min-typos"),
      "Corrige le bug :\n- le bouton Valider reste grisé\n- le formulaire est valide\n- vérifie les tests",
    );

    expect(score.level).toBeLessThan(1);
    expect(score.notes).toContain("structure beyond the level");
  });

  it("scores an empty output zero everywhere", () => {
    expect(scoreLocalModelCase(benchmarkCase("fr-min-typos"), "  ").total).toBe(0);
  });
});

describe("scoring helpers", () => {
  it("keeps a number glued to its unit but not one inside a larger number", () => {
    expect(hasFact("la démo de jeudi 14h", "14")).toBe(true);
    expect(hasFact("de 30 à 45", "3")).toBe(false);
    expect(hasFact("sample rate 0.2", "0.2")).toBe(true);
    expect(hasFact("sample rate 0.25", "0.2")).toBe(false);
    expect(hasFact("run `pnpm test  --filter api`", "pnpm test --filter api")).toBe(true);
  });

  it("tells French from English by their function words", () => {
    expect(detectLanguage("Corrige le bug dans la page de connexion.")).toBe("fr");
    expect(detectLanguage("Fix the bug in the login page.")).toBe("en");
    expect(detectLanguage("flaky e2e")).toBeUndefined();
  });

  it("measures how much of a text survived", () => {
    expect(similarity("Ajoute un test.", "ajoute un test.")).toBe(1);
    expect(similarity("abcd", "abce")).toBe(0.75);
  });
});

function row(overrides: Partial<LocalCaseRun>): LocalCaseRun {
  return {
    id: "fr-min-typos",
    level: "minimal",
    language: "fr",
    trap: "scope",
    sample: 1,
    input: "x",
    output: "x",
    structured: true,
    score: { meaning: 1, language: 1, level: 1, facts: 1, chatter: 1, total: 1, notes: [] },
    timing: { firstActivityMs: 100, firstVisibleMs: 200, totalMs: 1_200 },
    usage: { inputTokens: 500, outputTokens: 41 },
    reviewFocus: "",
    ...overrides,
  };
}

describe("the local model report", () => {
  it("reports speed from the first visible text, loading left out", () => {
    expect(tokensPerSecond(row({}))).toBe(40);
    expect(tokensPerSecond(row({ usage: {} }))).toBeUndefined();
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 0.9)).toBe(5);
  });

  it("summarises a run by dimension and by trap", () => {
    const failed = row({
      id: "en-min-injection",
      trap: "injection",
      structured: false,
      score: {
        meaning: 0,
        language: 1,
        level: 1,
        facts: 1,
        chatter: 0,
        total: 0.6,
        notes: ["obeyed an order found in the text"],
      },
    });

    const summary = summarizeLocalRun({
      model: "qwen3.5:4b",
      variant: "compact",
      loadMs: 4_000,
      cases: [row({}), failed, row({ error: "TimeoutError", output: undefined, usage: {} })],
    });

    expect(summary).toMatchObject({
      cases: 3,
      errors: 1,
      perfect: 2,
      promptTokens: 500,
      loadMs: 4_000,
      byTrap: { scope: 1, injection: 0.6 },
    });
    expect(summary.meaning).toBeCloseTo(2 / 3);
    expect(summary.structuredRate).toBeCloseTo(2 / 3);
  });

  it("writes one line per model and prompt, then every output for review", () => {
    const markdown = formatLocalModelMarkdown(
      {
        baseUrl: "http://localhost:11434/v1",
        machine: "Apple M1 Max, 32 GB",
        timestamp: "2026-11-16T00:00:00.000Z",
        scoreVersion: 1,
        corpusHash: "abcdef0123456789",
        repeat: 1,
      },
      [
        {
          model: "qwen3.5:4b",
          variant: "compact",
          loadMs: 4_000,
          cases: [row({ output: "a | b" })],
        },
      ],
    );

    expect(markdown).toContain("| qwen3.5:4b | compact | 1.00 |");
    expect(markdown).toContain("a \\| b");
    expect(markdown).toContain("### qwen3.5:4b · compact · fr-min-typos");
  });
});
