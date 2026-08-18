import { describe, expect, it } from "vitest";
import { REPROMPT_POLICY, resolveOutputTokenBudget } from "@/core/reprompt-policy.js";

describe("reprompt generation policy", () => {
  it("allocates more output room when the source text is longer", () => {
    const shortBudget = resolveOutputTokenBudget({
      input: "corrige cette phrase",
      level: "standard",
    });
    const longBudget = resolveOutputTokenBudget({
      input: "architecture ".repeat(800),
      level: "standard",
    });

    expect(longBudget).toBeGreaterThan(shortBudget);
  });

  it("never exceeds a model capability declared by the registry", () => {
    const budget = resolveOutputTokenBudget({
      input: "architecture ".repeat(800),
      level: "complete",
      modelMaxOutputTokens: 1_200,
    });

    expect(budget).toBe(1_200);
  });

  it("honors an explicit user budget within the model capability", () => {
    const budget = resolveOutputTokenBudget({
      input: "architecture ".repeat(800),
      level: "complete",
      requestedMaxOutputTokens: 2_000,
      modelMaxOutputTokens: 4_000,
    });

    expect(budget).toBe(2_000);
  });

  it("keeps policy values centralized and ordered by level", () => {
    expect(REPROMPT_POLICY.generation.levels.minimal.structuralReserveTokens).toBeLessThan(
      REPROMPT_POLICY.generation.levels.standard.structuralReserveTokens,
    );
    expect(REPROMPT_POLICY.generation.levels.standard.structuralReserveTokens).toBeLessThan(
      REPROMPT_POLICY.generation.levels.complete.structuralReserveTokens,
    );
    expect(REPROMPT_POLICY.runtime.defaultTimeoutMs).toBeGreaterThan(0);
  });
});
