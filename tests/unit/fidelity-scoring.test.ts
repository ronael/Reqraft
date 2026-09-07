import { expect, it } from "vitest";
import { scoreFidelityCase } from "../../benchmark/fidelity-scoring.js";
import { buildFidelityPlan } from "../../benchmark/fidelity-plan.js";
import { FIDELITY_BENCHMARK_CASES } from "../../benchmark/fidelity-cases.js";

const fragmentCase = FIDELITY_BENCHMARK_CASES.find(
  (item) => item.id === "clean-ambiguous-conversation-fragment",
);
if (fragmentCase === undefined) throw new Error("Missing conversation fragment fixture");
const fragment = fragmentCase;

it("fails a rewrite instruction even when the output preserves the source words", () => {
  const result = scoreFidelityCase(fragment, 'Reformule le texte suivant : "ema conv :"');
  expect(result.rewriteInstruction).toBe(true);
  expect(result.total).toBe(0);
});

it("accepts a preserved ambiguous fragment, allowing case and whitespace corrections", () => {
  expect(scoreFidelityCase(fragment, "  Ema conv :\n").total).toBe(1);
});

it("fails a guessed expansion of an ambiguous fragment", () => {
  const score = scoreFidelityCase(fragment, "Voici ma conversation : ema conv :");
  expect(score.acceptableOutput).toBe(false);
  expect(score.total).toBe(0);
});

it("gives an empty result zero instead of rewarding absent inventions", () => {
  expect(scoreFidelityCase(fragment, "").total).toBe(0);
});

it("plans the same cases for auto and explicit profiles with numbered independent samples", () => {
  const plan = buildFidelityPlan([fragment], { profileMode: "both", repeat: 2 });
  expect(plan.map(({ requestedProfile, sample }) => [requestedProfile, sample])).toEqual([
    ["clean", 1],
    ["auto", 1],
    ["clean", 2],
    ["auto", 2],
  ]);
  expect(plan.every((entry) => entry.benchmarkCase === fragment)).toBe(true);
});

it.each([0, -1, 1.5, 11, Number.NaN])("refuses an invalid repetition count: %s", (repeat) => {
  expect(() => buildFidelityPlan([fragment], { profileMode: "auto", repeat })).toThrow();
});
