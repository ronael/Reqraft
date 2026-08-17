import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BENCHMARK_DATASET } from "./cases/dataset.js";
import {
  aggregateAutoProfileResults,
  comparePromptSizes,
  type AutoProfileAggregate,
  type AutoProfileCaseResult,
  type PromptSizeComparison,
} from "./auto-profile-scoring.js";
import { rewrite } from "../src/core/engine.js";
import { buildAutoDetectPrompt, buildPrompt } from "../src/core/prompt-builder.js";
import { getProfile } from "../src/profiles/registry.js";
import { createProvider } from "../src/providers/registry.js";
import { resolveModel } from "../src/models/model-resolver.js";

/**
 * Measures the real `auto` profile-detection path end to end:
 * `input du dataset -> profile: "auto" -> provider/model -> result.profile`,
 * compared against the dataset's labelled profile. `benchmark/runner.ts`
 * calls `resolveProfile(benchmarkCase.profile)` with the EXPECTED profile
 * already given, which never exercises detection at all — this script is the
 * one that actually does.
 *
 * `pnpm benchmark:auto-profile [provider] [model]`, defaults to `mock`.
 *
 * The `mock` provider never reports a `profile` in its JSON response (see
 * `src/providers/mock.ts`), so every case falls back to `clean` under it —
 * that is expected, not a regression, and this script says so loudly rather
 * than reporting a misleading accuracy number. Run with a real provider
 * (`pnpm benchmark:auto-profile openai gpt-4.1-mini`, with the matching API
 * key set) for numbers worth trusting.
 */

/** Documented in docs/profiles.md — the offline keyword matcher's measured accuracy on this dataset before it was replaced. Not re-derived here: that detector no longer exists in this codebase. */
const PREVIOUS_LOCAL_HEURISTIC_ACCURACY = 0.5;

interface AutoProfileRun {
  provider: string;
  model: string;
  timestamp: string;
  mockCaveat: boolean;
  results: AutoProfileCaseResult[];
  aggregate: AutoProfileAggregate;
  promptSize: PromptSizeComparison;
  previousLocalHeuristicAccuracy: number;
}

async function runAutoProfileBenchmark(
  providerId: string,
  modelId?: string,
): Promise<AutoProfileRun> {
  const provider = createProvider(providerId as "mock", process.env);
  const { model, reasoningEffort } = resolveModel(providerId, modelId, "mock-model");
  const results: AutoProfileCaseResult[] = [];

  for (const benchmarkCase of BENCHMARK_DATASET) {
    try {
      const output = await rewrite({
        input: benchmarkCase.input,
        profile: "auto",
        level: "standard",
        provider,
        model,
        includeChanges: true,
        stream: false,
        reasoningEffort,
      });

      results.push({
        id: benchmarkCase.id,
        input: benchmarkCase.input,
        expectedProfile: benchmarkCase.profile,
        detectedProfile: output.profile,
        fellBackToDefault: output.quality.signals.some(
          (signal) => signal.code === "profile_detection_fallback",
        ),
        inputTokens: output.usage?.inputTokens,
        outputTokens: output.usage?.outputTokens,
        latencyMs: output.latencyMs,
      });
    } catch (error) {
      results.push({
        id: benchmarkCase.id,
        input: benchmarkCase.input,
        expectedProfile: benchmarkCase.profile,
        fellBackToDefault: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const promptSize = comparePromptSizes(
    BENCHMARK_DATASET,
    (input) =>
      buildAutoDetectPrompt({ input, level: "standard", includeChanges: true }).systemPrompt,
    (input, profileId) => {
      const profile = getProfile(profileId);
      if (!profile) return null;
      return buildPrompt({ input, profile, level: "standard", includeChanges: true }).systemPrompt;
    },
  );

  return {
    provider: providerId,
    model,
    timestamp: new Date().toISOString(),
    mockCaveat: providerId === "mock",
    results,
    aggregate: aggregateAutoProfileResults(results),
    promptSize,
    previousLocalHeuristicAccuracy: PREVIOUS_LOCAL_HEURISTIC_ACCURACY,
  };
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatTokens(value: number | undefined): string {
  return value === undefined ? "n/a" : value.toFixed(1);
}

function formatLatency(meanLatencyMs: number | undefined): string {
  return meanLatencyMs === undefined ? "n/a" : `${meanLatencyMs.toFixed(0)} ms`;
}

function formatConfusionMatrix(confusionMatrix: AutoProfileAggregate["confusionMatrix"]): string[] {
  const profiles = Object.keys(confusionMatrix).sort((a, b) => a.localeCompare(b));
  if (profiles.length === 0) return ["No scored case."];

  const header = `| expected \\ detected | ${profiles.join(" | ")} |`;
  const separator = `|---|${profiles.map(() => "---:").join("|")}|`;
  const rows = profiles.map((expected) => {
    const row = confusionMatrix[expected] ?? {};
    const cells = profiles.map((detected) => String(row[detected] ?? 0));
    return `| ${expected} | ${cells.join(" | ")} |`;
  });

  return [header, separator, ...rows];
}

function formatMisclassifications(
  misclassifications: AutoProfileAggregate["misclassifications"],
): string[] {
  if (misclassifications.length === 0) return ["None."];

  const rows = misclassifications.map(
    (item) => `| ${item.id} | ${item.expectedProfile} | ${item.detectedProfile} |`,
  );
  return ["| Case | Expected | Detected |", "|---|---|---|", ...rows];
}

function formatMarkdown(run: AutoProfileRun): string {
  const { aggregate, promptSize } = run;
  const delta = aggregate.accuracy - run.previousLocalHeuristicAccuracy;
  const lines = [
    "# Reqraft — auto profile detection benchmark",
    "",
    `- Provider: ${run.provider}`,
    `- Model: ${run.model}`,
    `- Date: ${run.timestamp}`,
    "",
    ...(run.mockCaveat
      ? [
          "> **mock provider**: never reports a `profile` field, so every case falls " +
            "back to `clean` — the numbers below only show the harness works, they are " +
            "not a measure of real accuracy. Run with a real provider for that.",
          "",
        ]
      : []),
    "## Accuracy",
    "",
    `- Total cases: ${String(aggregate.totalCases)}`,
    `- Scored cases (excludes hard errors): ${String(aggregate.scoredCases)}`,
    `- Correctly detected: ${String(aggregate.correctCases)}`,
    `- Accuracy: ${formatPercent(aggregate.accuracy)}`,
    `- Previous local heuristic baseline: ${formatPercent(run.previousLocalHeuristicAccuracy)} ` +
      `(documented in docs/profiles.md, dataset-measured before that detector was removed)`,
    `- Delta vs previous baseline: ${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} points`,
    `- Fallbacks to the fixed default (\`profile_detection_fallback\`): ${String(aggregate.fallbackCount)}`,
    `- Hard errors: ${String(aggregate.errorCount)}`,
    "",
    "## Accuracy per expected profile",
    "",
    "| Profile | Correct / total | Accuracy |",
    "|---|---:|---:|",
    ...aggregate.perProfile.map(
      (row) =>
        `| ${row.profile} | ${String(row.correct)} / ${String(row.total)} | ${formatPercent(row.accuracy)} |`,
    ),
    "",
    "## Confusion matrix (rows = expected, columns = detected)",
    "",
    ...formatConfusionMatrix(aggregate.confusionMatrix),
    "",
    "## Misclassifications",
    "",
    ...formatMisclassifications(aggregate.misclassifications),
    "",
    "## Cost and latency",
    "",
    `- Mean input tokens: ${formatTokens(aggregate.meanInputTokens)}`,
    `- Mean output tokens: ${formatTokens(aggregate.meanOutputTokens)}`,
    `- Mean total tokens: ${formatTokens(aggregate.meanTotalTokens)}`,
    `- Mean latency: ${formatLatency(aggregate.meanLatencyMs)}`,
    "- Mean estimated cost: not available — `RepromptResult.usage.estimatedCost` " +
      "is not computed by the engine for any profile today, not specific to `auto`.",
    "",
    "### System prompt size: auto vs explicit profile (not provider-dependent)",
    "",
    "Character count of the actual system prompt string built for each case — a " +
      "measured fact, not an estimated token count, and available with no provider at all.",
    "",
    `- Mean auto-detect system prompt: ${promptSize.meanAutoChars.toFixed(0)} chars`,
    `- Mean explicit-profile system prompt: ${promptSize.meanExplicitChars.toFixed(0)} chars`,
    `- Mean difference: +${promptSize.meanDeltaChars.toFixed(0)} chars ` +
      `(${formatPercent(promptSize.meanDeltaRatio)} bigger)`,
  ];

  return lines.join("\n");
}

async function main(): Promise<void> {
  const provider = process.argv[2] ?? "mock";
  const model = process.argv[3];

  const modelSuffix = model ? ` model=${model}` : "";
  console.log(`Auto profile detection benchmark, provider=${provider}${modelSuffix}`);
  const run = await runAutoProfileBenchmark(provider, model);

  const outDir = path.join(process.cwd(), "benchmark-results");
  await mkdir(outDir, { recursive: true });

  const baseName = `auto-profile-${run.provider}-${run.model}-${run.timestamp.replace(/[:.]/g, "-")}`;
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const mdPath = path.join(outDir, `${baseName}.md`);

  await writeFile(jsonPath, JSON.stringify(run, null, 2), "utf8");
  await writeFile(mdPath, formatMarkdown(run), "utf8");

  if (run.mockCaveat) {
    console.warn(
      "mock provider: every case falls back to `clean` (no `profile` field in mock " +
        "responses) — these numbers do not reflect real accuracy. Use a real provider.",
    );
  }
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
  console.log(
    `Accuracy: ${formatPercent(run.aggregate.accuracy)} ` +
      `(previous local heuristic: ${formatPercent(run.previousLocalHeuristicAccuracy)})`,
  );
  console.log(
    `Fallbacks: ${String(run.aggregate.fallbackCount)}/${String(run.aggregate.totalCases)}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
