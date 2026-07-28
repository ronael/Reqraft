import type { BenchmarkCase } from "./cases/dataset.js";

export interface BenchmarkScore {
  intention: number;
  terms: number;
  noInvention: number;
  clarity: number;
  profile: number;
  total: number;
}

export function scoreCase(output: string, originalCase: BenchmarkCase): BenchmarkScore {
  const lowerOutput = output.toLowerCase();

  const requiredTermsFound = originalCase.requiredTerms.filter((term) =>
    lowerOutput.includes(term.toLowerCase()),
  ).length;
  const termsScore = requiredTermsFound / originalCase.requiredTerms.length;

  const forbiddenFound = (originalCase.forbiddenAdditions ?? []).filter((term) =>
    lowerOutput.includes(term.toLowerCase()),
  ).length;
  const noInventionScore = forbiddenFound === 0 ? 1 : 0;

  const intentionScore = 1; // Heuristic placeholder; manual review recommended.
  const clarityScore = output.length > 0 && output.length < originalCase.input.length * 3 ? 1 : 0.5;
  const profileScore = 1; // Profile was enforced by the runner.

  const total = (intentionScore + termsScore + noInventionScore + clarityScore + profileScore) / 5;

  return {
    intention: intentionScore,
    terms: termsScore,
    noInvention: noInventionScore,
    clarity: clarityScore,
    profile: profileScore,
    total,
  };
}
