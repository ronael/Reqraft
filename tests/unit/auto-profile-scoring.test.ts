import { describe, expect, it } from "vitest";
import {
  aggregateAutoProfileResults,
  comparePromptSizes,
  type AutoProfileCaseResult,
} from "../../benchmark/auto-profile-scoring.js";
import type { BenchmarkCase } from "../../benchmark/cases/dataset.js";

function row(overrides: Partial<AutoProfileCaseResult> = {}): AutoProfileCaseResult {
  return {
    id: "case-1",
    input: "peu importe",
    expectedProfile: "frontend",
    detectedProfile: "frontend",
    fellBackToDefault: false,
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 200,
    ...overrides,
  };
}

describe("aggregateAutoProfileResults", () => {
  it("computes overall accuracy from correct vs total scored cases", () => {
    const aggregate = aggregateAutoProfileResults([
      row({ id: "a", detectedProfile: "frontend" }),
      row({ id: "b", expectedProfile: "code", detectedProfile: "code" }),
      row({ id: "c", expectedProfile: "code", detectedProfile: "clean" }),
    ]);

    expect(aggregate.totalCases).toBe(3);
    expect(aggregate.scoredCases).toBe(3);
    expect(aggregate.correctCases).toBe(2);
    expect(aggregate.accuracy).toBeCloseTo(2 / 3);
  });

  it("excludes hard errors from scoring, without discarding them from the totals", () => {
    const aggregate = aggregateAutoProfileResults([
      row({ id: "a", detectedProfile: "frontend" }),
      row({ id: "b", detectedProfile: undefined, error: "timeout", fellBackToDefault: false }),
    ]);

    expect(aggregate.totalCases).toBe(2);
    expect(aggregate.scoredCases).toBe(1);
    expect(aggregate.correctCases).toBe(1);
    expect(aggregate.accuracy).toBe(1); // the errored case does not count as a wrong guess
    expect(aggregate.errorCount).toBe(1);
  });

  it("breaks accuracy down per expected profile", () => {
    const aggregate = aggregateAutoProfileResults([
      row({ id: "a", expectedProfile: "frontend", detectedProfile: "frontend" }),
      row({ id: "b", expectedProfile: "frontend", detectedProfile: "clean" }),
      row({ id: "c", expectedProfile: "code", detectedProfile: "code" }),
    ]);

    expect(aggregate.perProfile).toEqual(
      expect.arrayContaining([
        { profile: "frontend", total: 2, correct: 1, accuracy: 0.5 },
        { profile: "code", total: 1, correct: 1, accuracy: 1 },
      ]),
    );
  });

  it("builds a confusion matrix of expected vs detected counts", () => {
    const aggregate = aggregateAutoProfileResults([
      row({ id: "a", expectedProfile: "frontend", detectedProfile: "frontend" }),
      row({ id: "b", expectedProfile: "frontend", detectedProfile: "clean" }),
      row({ id: "c", expectedProfile: "frontend", detectedProfile: "clean" }),
    ]);

    expect(aggregate.confusionMatrix).toEqual({
      frontend: { frontend: 1, clean: 2 },
    });
  });

  it("lists only the misclassified cases, with the case id and both profiles", () => {
    const aggregate = aggregateAutoProfileResults([
      row({ id: "a", detectedProfile: "frontend" }),
      row({ id: "b", expectedProfile: "code", detectedProfile: "clean" }),
    ]);

    expect(aggregate.misclassifications).toEqual([
      { id: "b", expectedProfile: "code", detectedProfile: "clean" },
    ]);
  });

  it("counts fallbacks independently of whether they landed on the right profile", () => {
    const aggregate = aggregateAutoProfileResults([
      // Fell back to clean, and clean happened to be the expected profile.
      row({ id: "a", expectedProfile: "clean", detectedProfile: "clean", fellBackToDefault: true }),
      row({ id: "b", detectedProfile: "frontend", fellBackToDefault: false }),
    ]);

    expect(aggregate.fallbackCount).toBe(1);
    expect(aggregate.correctCases).toBe(2); // still counted as correct — see the field's own doc comment
  });

  it("averages tokens and latency over cases that actually reported them", () => {
    const aggregate = aggregateAutoProfileResults([
      row({ id: "a", inputTokens: 100, outputTokens: 50, latencyMs: 200 }),
      row({ id: "b", inputTokens: 300, outputTokens: 150, latencyMs: 600 }),
      row({ id: "c", inputTokens: undefined, outputTokens: undefined, latencyMs: undefined }),
    ]);

    expect(aggregate.meanInputTokens).toBeCloseTo(200);
    expect(aggregate.meanOutputTokens).toBeCloseTo(100);
    expect(aggregate.meanTotalTokens).toBeCloseTo(300);
    expect(aggregate.meanLatencyMs).toBeCloseTo(400);
  });

  it("reports undefined means rather than NaN when nothing measured that field", () => {
    const aggregate = aggregateAutoProfileResults([
      row({ id: "a", inputTokens: undefined, outputTokens: undefined, latencyMs: undefined }),
    ]);

    expect(aggregate.meanInputTokens).toBeUndefined();
    expect(aggregate.meanLatencyMs).toBeUndefined();
  });

  it("handles an empty result set without crashing or dividing by zero into NaN", () => {
    const aggregate = aggregateAutoProfileResults([]);

    expect(aggregate.totalCases).toBe(0);
    expect(aggregate.accuracy).toBe(0);
    expect(aggregate.perProfile).toEqual([]);
    expect(aggregate.confusionMatrix).toEqual({});
  });
});

describe("comparePromptSizes", () => {
  const cases: BenchmarkCase[] = [
    {
      id: "a",
      input: "short",
      profile: "frontend",
      requiredTerms: [],
      expectedIntent: "",
    },
    {
      id: "b",
      input: "also short",
      profile: "code",
      requiredTerms: [],
      expectedIntent: "",
    },
  ];

  it("measures the mean character-length difference between the auto and explicit prompts", () => {
    const result = comparePromptSizes(
      cases,
      () => "x".repeat(100),
      () => "x".repeat(40),
    );

    expect(result.meanAutoChars).toBe(100);
    expect(result.meanExplicitChars).toBe(40);
    expect(result.meanDeltaChars).toBe(60);
    expect(result.meanDeltaRatio).toBeCloseTo(1.5);
  });

  it("skips a case whose profile the explicit builder does not recognise, rather than guessing", () => {
    const result = comparePromptSizes(
      cases,
      () => "x".repeat(100),
      (_input, profile) => (profile === "code" ? "x".repeat(50) : null),
    );

    // Only the "code" case contributes; "frontend" was skipped.
    expect(result.meanAutoChars).toBe(100);
    expect(result.meanExplicitChars).toBe(50);
  });

  it("returns zeros rather than NaN when every case is skipped", () => {
    const result = comparePromptSizes(
      cases,
      () => "x".repeat(100),
      () => null,
    );

    expect(result.meanAutoChars).toBe(0);
    expect(result.meanExplicitChars).toBe(0);
    expect(result.meanDeltaRatio).toBe(0);
  });
});
