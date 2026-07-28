import { describe, expect, it } from "vitest";
import { FIDELITY_BENCHMARK_CASES } from "../../benchmark/fidelity-cases.js";

describe("fidelity benchmark dataset", () => {
  it("contains at least 40 reference cases", () => {
    expect(FIDELITY_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(40);
  });

  it("covers every built-in task profile family", () => {
    const profiles = new Set(FIDELITY_BENCHMARK_CASES.map((testCase) => testCase.profile));

    for (const profile of ["clean", "code", "frontend", "web-design", "debug", "review", "writing"]) {
      expect(profiles.has(profile)).toBe(true);
    }
  });

  it("defines forbidden additions for every case", () => {
    for (const testCase of FIDELITY_BENCHMARK_CASES) {
      expect(testCase.forbiddenAdditions.length).toBeGreaterThan(0);
    }
  });
});
