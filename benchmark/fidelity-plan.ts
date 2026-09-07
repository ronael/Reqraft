import type { FidelityBenchmarkCase } from "./fidelity-cases.js";

export interface FidelityPlanOptions {
  profileMode: "explicit" | "auto" | "both";
  repeat: number;
}

export function buildFidelityPlan(
  cases: readonly FidelityBenchmarkCase[],
  { profileMode, repeat }: FidelityPlanOptions,
): { benchmarkCase: FidelityBenchmarkCase; requestedProfile: string; sample: number }[] {
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) {
    throw new Error("Repeat must be an integer between 1 and 10.");
  }
  return cases.flatMap((benchmarkCase) => {
    const profiles =
      profileMode === "both"
        ? [benchmarkCase.profile, "auto"]
        : [profileMode === "auto" ? "auto" : benchmarkCase.profile];
    return Array.from({ length: repeat }, (_, index) =>
      profiles.map((requestedProfile) => ({ benchmarkCase, requestedProfile, sample: index + 1 })),
    ).flat();
  });
}
