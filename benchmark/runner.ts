import process from "node:process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { BENCHMARK_DATASET } from "./cases/dataset.js";
import { SCORE_VERSION, scoreCase, summarizeByProfile, type ProfileBreakdown } from "./scoring.js";
import { rewrite } from "@/core/engine.js";
import { resolveProfile } from "@/profiles/registry.js";
import { createProvider } from "@/providers/registry.js";
import { resolveModel } from "@/models/model-resolver.js";
import type { RepromptResult } from "@/core/types.js";

interface BenchmarkRun {
  provider: string;
  model: string;
  timestamp: string;
  results: {
    id: string;
    profile: string;
    input: string;
    output: RepromptResult;
    score: ReturnType<typeof scoreCase>;
  }[];
  /**
   * La version des règles de calcul.
   *
   * Sans elle, comparer deux exécutions séparées par un changement de score
   * donnerait un écart qui ne mesure que ce changement.
   */
  scoreVersion: number;
  aggregate: {
    meanTotal: number;
    totalTokens: number;
    totalLatencyMs: number;
    /** Le même score, profil par profil : une moyenne unique les compense. */
    byProfile: ProfileBreakdown[];
  };
}

async function runBenchmark(providerId: string, modelId?: string): Promise<BenchmarkRun> {
  const provider = createProvider(providerId as "mock", process.env);
  const { model } = resolveModel(providerId, modelId, "mock-model");
  const timestamp = new Date().toISOString();

  const results = [];
  let totalTokens = 0;
  let totalLatencyMs = 0;

  for (const benchmarkCase of BENCHMARK_DATASET) {
    const { profile } = resolveProfile(benchmarkCase.profile);
    const result = await rewrite({
      input: benchmarkCase.input,
      profile,
      level: "standard",
      provider,
      model,
      includeChanges: true,
      stream: false,
    });

    totalTokens += (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
    totalLatencyMs += result.latencyMs ?? 0;

    results.push({
      id: benchmarkCase.id,
      profile: benchmarkCase.profile,
      input: benchmarkCase.input,
      output: result,
      score: scoreCase(result.rewritten, benchmarkCase),
    });
  }

  const meanTotal = results.reduce((sum, r) => sum + r.score.total, 0) / results.length;

  return {
    provider: providerId,
    model,
    timestamp,
    scoreVersion: SCORE_VERSION,
    results,
    aggregate: {
      meanTotal,
      totalTokens,
      totalLatencyMs,
      byProfile: summarizeByProfile(results),
    },
  };
}

function formatMarkdown(run: BenchmarkRun): string {
  const lines = [
    "# Benchmark Reqraft",
    "",
    `- Provider : ${run.provider}`,
    `- Modèle : ${run.model}`,
    `- Date : ${run.timestamp}`,
    `- Cas : ${String(run.results.length)}`,
    `- Score moyen : ${run.aggregate.meanTotal.toFixed(2)}`,
    `- Tokens totaux : ${String(run.aggregate.totalTokens)}`,
    `- Latence totale : ${String(run.aggregate.totalLatencyMs)}ms`,
    "",
    "## Par profil",
    "",
    "| Profil | Cas | Total | Termes | Intention | Sans invention | Clarté |",
    "|---|---|---|---|---|---|---|",
    ...run.aggregate.byProfile.map(
      (row) =>
        `| ${row.profile} | ${String(row.cases)} | ${row.meanTotal.toFixed(2)} | ` +
        `${row.meanTerms.toFixed(2)} | ${row.meanIntention.toFixed(2)} | ` +
        `${row.meanNoInvention.toFixed(2)} | ${row.meanClarity.toFixed(2)} |`,
    ),
    "",
    "## Cas",
    "",
    "| ID | Profil | Score | Input | Output |",
    "|---|---|---|---|---|",
  ];

  for (const result of run.results) {
    const input = result.input.replace(/\|/g, "\\|").slice(0, 60);
    const output = result.output.rewritten.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 80);
    lines.push(
      `| ${result.id} | ${result.profile} | ${result.score.total.toFixed(2)} | ${input} | ${output} |`,
    );
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const provider = process.argv[2] ?? "mock";
  const model = process.argv[3];

  const modelSuffix = model ? ` model=${model}` : "";
  console.log(`Benchmark avec provider=${provider}${modelSuffix}`);
  const run = await runBenchmark(provider, model);

  const outDir = path.join(process.cwd(), "benchmark-results");
  await mkdir(outDir, { recursive: true });

  const baseName = `${run.provider}-${run.model}-${run.timestamp.replace(/[:.]/g, "-")}`;
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const mdPath = path.join(outDir, `${baseName}.md`);

  await writeFile(jsonPath, JSON.stringify(run, null, 2), "utf8");
  await writeFile(mdPath, formatMarkdown(run), "utf8");

  console.log(`Résultats écrits dans ${outDir}`);
  console.log(`Score moyen : ${run.aggregate.meanTotal.toFixed(2)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
