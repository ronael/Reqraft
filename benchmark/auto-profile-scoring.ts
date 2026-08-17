import type { BenchmarkCase } from "./cases/dataset.js";

/**
 * Pure aggregation for the `auto` profile-detection benchmark.
 *
 * Split out from `auto-profile-runner.ts` the same way `scoring.ts` is split
 * out from `runner.ts`: no provider, no filesystem, so it can be exercised in
 * `pnpm test` with fabricated rows instead of only by hand, from
 * `benchmark-results/`.
 */

export interface AutoProfileCaseResult {
  id: string;
  input: string;
  expectedProfile: string;
  /** Absent when the case errored before a profile could be read at all. */
  detectedProfile?: string;
  /** True when `profile_detection_fallback` fired for this case. */
  fellBackToDefault: boolean;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  error?: string;
}

export interface ProfileAccuracy {
  profile: string;
  total: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
}

/** `confusionMatrix[expected][detected]` = number of cases. */
export type ConfusionMatrix = Record<string, Record<string, number>>;

export interface Misclassification {
  id: string;
  expectedProfile: string;
  detectedProfile: string;
}

export interface AutoProfileAggregate {
  totalCases: number;
  /** Cases where a profile was actually read back (excludes hard errors). */
  scoredCases: number;
  correctCases: number;
  /** 0..1 over `scoredCases`, not `totalCases` — an error is not a wrong guess. */
  accuracy: number;
  perProfile: ProfileAccuracy[];
  confusionMatrix: ConfusionMatrix;
  misclassifications: Misclassification[];
  fallbackCount: number;
  errorCount: number;
  meanInputTokens: number | undefined;
  meanOutputTokens: number | undefined;
  meanTotalTokens: number | undefined;
  meanLatencyMs: number | undefined;
}

function mean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** `defined` narrows out `undefined` so `mean` only ever sees real numbers. */
function definedNumbers(values: readonly (number | undefined)[]): number[] {
  return values.filter((value): value is number => value !== undefined);
}

export function aggregateAutoProfileResults(
  results: readonly AutoProfileCaseResult[],
): AutoProfileAggregate {
  const scored = results.filter((result) => result.detectedProfile !== undefined);
  const correct = scored.filter((result) => result.detectedProfile === result.expectedProfile);

  const perProfileMap = new Map<string, { total: number; correct: number }>();
  const confusionMatrix: ConfusionMatrix = {};
  const misclassifications: Misclassification[] = [];

  for (const result of scored) {
    const detected = result.detectedProfile;
    if (detected === undefined) continue; // narrowed already, keeps TS happy below

    const bucket = perProfileMap.get(result.expectedProfile) ?? { total: 0, correct: 0 };
    bucket.total += 1;
    if (detected === result.expectedProfile) bucket.correct += 1;
    perProfileMap.set(result.expectedProfile, bucket);

    const row = confusionMatrix[result.expectedProfile] ?? {};
    row[detected] = (row[detected] ?? 0) + 1;
    confusionMatrix[result.expectedProfile] = row;

    if (detected !== result.expectedProfile) {
      misclassifications.push({
        id: result.id,
        expectedProfile: result.expectedProfile,
        detectedProfile: detected,
      });
    }
  }

  const perProfile: ProfileAccuracy[] = [...perProfileMap.entries()]
    .map(([profile, bucket]) => ({
      profile,
      total: bucket.total,
      correct: bucket.correct,
      accuracy: bucket.total > 0 ? bucket.correct / bucket.total : 0,
    }))
    .sort((a, b) => a.profile.localeCompare(b.profile));

  const inputTokens = definedNumbers(results.map((result) => result.inputTokens));
  const outputTokens = definedNumbers(results.map((result) => result.outputTokens));
  const totalTokensPerCase = results
    .filter((result) => result.inputTokens !== undefined && result.outputTokens !== undefined)
    .map((result) => (result.inputTokens ?? 0) + (result.outputTokens ?? 0));
  const latencies = definedNumbers(results.map((result) => result.latencyMs));

  return {
    totalCases: results.length,
    scoredCases: scored.length,
    correctCases: correct.length,
    accuracy: scored.length > 0 ? correct.length / scored.length : 0,
    perProfile,
    confusionMatrix,
    misclassifications,
    fallbackCount: results.filter((result) => result.fellBackToDefault).length,
    errorCount: results.filter((result) => result.error !== undefined).length,
    meanInputTokens: mean(inputTokens),
    meanOutputTokens: mean(outputTokens),
    meanTotalTokens: mean(totalTokensPerCase),
    meanLatencyMs: mean(latencies),
  };
}

export interface PromptSizeComparison {
  /** Mean system-prompt length, in characters, for the `auto` request. */
  meanAutoChars: number;
  /** Mean system-prompt length an explicit-profile request would have sent. */
  meanExplicitChars: number;
  meanDeltaChars: number;
  /** `meanDeltaChars / meanExplicitChars`, as a fraction (0.2 = 20% bigger). */
  meanDeltaRatio: number;
}

/**
 * Measures the one honest, provider-independent cost signal available without
 * an API key: how much bigger the `auto` system prompt actually is, in real
 * characters, compared to what the same case would have sent with its
 * expected profile picked explicitly. Not a token estimate — an estimate
 * would be a number this repo did not measure.
 */
export function comparePromptSizes(
  cases: readonly BenchmarkCase[],
  buildAutoSystemPrompt: (input: string) => string,
  buildExplicitSystemPrompt: (input: string, profile: string) => string | null,
): PromptSizeComparison {
  const autoLengths: number[] = [];
  const explicitLengths: number[] = [];

  for (const benchmarkCase of cases) {
    const explicitPrompt = buildExplicitSystemPrompt(benchmarkCase.input, benchmarkCase.profile);
    if (explicitPrompt === null) continue; // unknown profile id in the dataset — skip, don't guess
    autoLengths.push(buildAutoSystemPrompt(benchmarkCase.input).length);
    explicitLengths.push(explicitPrompt.length);
  }

  const meanAutoChars = mean(autoLengths) ?? 0;
  const meanExplicitChars = mean(explicitLengths) ?? 0;
  const meanDeltaChars = meanAutoChars - meanExplicitChars;

  return {
    meanAutoChars,
    meanExplicitChars,
    meanDeltaChars,
    meanDeltaRatio: meanExplicitChars > 0 ? meanDeltaChars / meanExplicitChars : 0,
  };
}
