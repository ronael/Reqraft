import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIDELITY_BENCHMARK_CASES, type FidelityBenchmarkCase } from "./fidelity-cases.js";
import { detectUnsupportedAdditions, isDisproportionateExpansion } from "@/core/fidelity.js";
import { rewrite } from "@/core/engine.js";
import { resolveProfile } from "@/profiles/registry.js";
import { createProvider } from "@/providers/registry.js";
import { resolveModel } from "@/models/model-resolver.js";
import type { RepromptResult } from "@/core/types.js";

interface FidelityCaseResult {
  id: string;
  profile: string;
  level: string;
  input: string;
  output?: RepromptResult;
  score: {
    preservedTerms: number;
    forbiddenAdditions: string[];
    disproportionateExpansion: boolean;
    nonEmpty: boolean;
    total: number;
  };
  error?: string;
}

interface FidelityRun {
  provider: string;
  model: string;
  timestamp: string;
  results: FidelityCaseResult[];
  aggregate: {
    cases: number;
    failures: number;
    meanScore: number;
    totalLatencyMs: number;
    totalTokens: number;
  };
}

async function runFidelityBenchmark(providerId: string, modelId?: string): Promise<FidelityRun> {
  const provider = createProvider(providerId as "mock", process.env);
  const { model, reasoningEffort } = resolveModel(providerId, modelId, "mock-model");
  const results: FidelityCaseResult[] = [];
  let totalLatencyMs = 0;
  let totalTokens = 0;

  for (const benchmarkCase of FIDELITY_BENCHMARK_CASES) {
    try {
      const { profile } = resolveProfile(benchmarkCase.profile);
      const output = await rewrite({
        input: benchmarkCase.input,
        profile,
        level: benchmarkCase.level,
        provider,
        model,
        includeChanges: false,
        stream: false,
        reasoningEffort,
        fidelityMode: "permissive",
      });

      totalLatencyMs += output.latencyMs ?? 0;
      totalTokens += (output.usage?.inputTokens ?? 0) + (output.usage?.outputTokens ?? 0);

      results.push({
        id: benchmarkCase.id,
        profile: benchmarkCase.profile,
        level: benchmarkCase.level,
        input: benchmarkCase.input,
        output,
        score: scoreCase(benchmarkCase, output.rewritten),
      });
    } catch (error) {
      results.push({
        id: benchmarkCase.id,
        profile: benchmarkCase.profile,
        level: benchmarkCase.level,
        input: benchmarkCase.input,
        error: error instanceof Error ? error.message : String(error),
        score: {
          preservedTerms: 0,
          forbiddenAdditions: [],
          disproportionateExpansion: false,
          nonEmpty: false,
          total: 0,
        },
      });
    }
  }

  const failures = results.filter(
    (result) => result.error !== undefined || !result.score.nonEmpty,
  ).length;
  const meanScore = results.reduce((sum, result) => sum + result.score.total, 0) / results.length;

  return {
    provider: providerId,
    model,
    timestamp: new Date().toISOString(),
    results,
    aggregate: {
      cases: results.length,
      failures,
      meanScore,
      totalLatencyMs,
      totalTokens,
    },
  };
}

function scoreCase(
  benchmarkCase: FidelityBenchmarkCase,
  output: string,
): FidelityCaseResult["score"] {
  const preservedTerms = benchmarkCase.mustPreserve
    ? benchmarkCase.mustPreserve.filter((term) => output.toLowerCase().includes(term.toLowerCase()))
        .length / benchmarkCase.mustPreserve.length
    : 1;
  const forbiddenAdditions = [
    ...new Set([
      ...benchmarkCase.forbiddenAdditions.filter((term) =>
        output.toLowerCase().includes(term.toLowerCase()),
      ),
      ...detectUnsupportedAdditions(benchmarkCase.input, output),
    ]),
  ];
  const disproportionateExpansion = isDisproportionateExpansion(
    benchmarkCase.input,
    output,
    benchmarkCase.level,
  );
  const nonEmpty = output.trim().length > 0;

  const noForbiddenScore = forbiddenAdditions.length === 0 ? 1 : 0;
  const proportionScore = disproportionateExpansion ? 0 : 1;
  const nonEmptyScore = nonEmpty ? 1 : 0;
  const total = (preservedTerms + noForbiddenScore + proportionScore + nonEmptyScore) / 4;

  return {
    preservedTerms,
    forbiddenAdditions,
    disproportionateExpansion,
    nonEmpty,
    total,
  };
}

function formatMarkdown(run: FidelityRun): string {
  const lines = [
    "# Reqraft Fidelity Benchmark",
    "",
    `- Provider: ${run.provider}`,
    `- Model: ${run.model}`,
    `- Date: ${run.timestamp}`,
    `- Cases: ${String(run.aggregate.cases)}`,
    `- Failures: ${String(run.aggregate.failures)}`,
    `- Mean score: ${run.aggregate.meanScore.toFixed(2)}`,
    `- Total latency: ${String(run.aggregate.totalLatencyMs)} ms`,
    `- Total tokens: ${String(run.aggregate.totalTokens)}`,
    "",
    "| ID | Profile | Level | Score | Latency | Forbidden | Output |",
    "|---|---|---|---:|---:|---|---|",
  ];

  for (const result of run.results) {
    const latency =
      result.output?.latencyMs !== undefined ? `${String(result.output.latencyMs)} ms` : "-";
    const forbidden = result.score.forbiddenAdditions.join(", ") || "-";
    const output = (result.error ?? result.output?.rewritten ?? "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ")
      .slice(0, 140);
    lines.push(
      `| ${result.id} | ${result.profile} | ${result.level} | ${result.score.total.toFixed(2)} | ${latency} | ${forbidden} | ${output} |`,
    );
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const provider = process.argv[2] ?? "mock";
  const model = process.argv[3];

  const modelSuffix = model ? ` model=${model}` : "";
  console.log(`Fidelity benchmark provider=${provider}${modelSuffix}`);
  const run = await runFidelityBenchmark(provider, model);

  const outDir = path.join(process.cwd(), "benchmark-results");
  await mkdir(outDir, { recursive: true });

  const baseName = `fidelity-${run.provider}-${run.model}-${run.timestamp.replace(/[:.]/g, "-")}`;
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const mdPath = path.join(outDir, `${baseName}.md`);

  await writeFile(jsonPath, JSON.stringify(run, null, 2), "utf8");
  await writeFile(mdPath, formatMarkdown(run), "utf8");

  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
  console.log(`Mean score: ${run.aggregate.meanScore.toFixed(2)}`);
  console.log(`Failures: ${String(run.aggregate.failures)}/${String(run.aggregate.cases)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
