import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { Command, Option } from "commander";
import { buildFidelityPlan, type FidelityPlanOptions } from "./fidelity-plan.js";
import { scoreFidelityCase, FIDELITY_SCORE_VERSION } from "./fidelity-scoring.js";
import { FIDELITY_BENCHMARK_CASES, type FidelityBenchmarkCase } from "./fidelity-cases.js";
import { rewrite } from "@/core/engine.js";
import { resolveProfile } from "@/profiles/registry.js";
import { createProvider } from "@/providers/registry.js";
import { resolveModel } from "@/models/model-resolver.js";
import type { ProviderAdapter, ProviderRequest, RepromptResult } from "@/core/types.js";

interface FidelityCaseResult {
  id: string;
  profile: string;
  level: string;
  input: string;
  output?: RepromptResult;
  requestedProfile: string;
  sample: number;
  reviewFocus?: string;
  requestHash?: string;
  score: ReturnType<typeof scoreFidelityCase>;
  error?: string;
}

export interface FidelityRun {
  scoreVersion: number;
  corpusHash: string;
  plan: FidelityPlanOptions;
  provider: string;
  model: string;
  timestamp: string;
  results: FidelityCaseResult[];
  aggregate: {
    cases: number;
    failures: number;
    regressions: number;
    meanScore: number;
    totalLatencyMs: number;
    totalTokens: number;
  };
}

interface FidelityRunOptions extends Partial<FidelityPlanOptions> {
  provider: ProviderAdapter;
  model: string;
  reasoningEffort?: NonNullable<ProviderRequest["reasoningEffort"]>;
  cases?: FidelityBenchmarkCase[];
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function runFidelityBenchmark({
  provider,
  model,
  reasoningEffort,
  cases = FIDELITY_BENCHMARK_CASES,
  profileMode = "explicit",
  repeat = 1,
}: FidelityRunOptions): Promise<FidelityRun> {
  const plan = buildFidelityPlan(cases, { profileMode, repeat });
  if (plan.length === 0) throw new Error("No benchmark cases selected.");
  const results: FidelityCaseResult[] = [];
  let totalLatencyMs = 0;
  let totalTokens = 0;

  for (const { benchmarkCase, requestedProfile, sample } of plan) {
    let requestHash: string | undefined;
    const measuredProvider: ProviderAdapter = {
      id: provider.id,
      name: provider.name,
      validateConfiguration: () => provider.validateConfiguration(),
      generate: (request) => {
        requestHash = hash({
          model: request.model,
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          stream: request.stream,
          reasoningEffort: request.reasoningEffort,
        });
        return provider.generate(request);
      },
    };
    const identity = {
      id: benchmarkCase.id,
      profile: benchmarkCase.profile,
      level: benchmarkCase.level,
      input: benchmarkCase.input,
      requestedProfile,
      sample,
      reviewFocus: benchmarkCase.reviewFocus,
    };
    try {
      const { profile } = resolveProfile(requestedProfile);
      const output = await rewrite({
        input: benchmarkCase.input,
        profile,
        level: benchmarkCase.level,
        provider: measuredProvider,
        model,
        includeChanges: false,
        stream: false,
        reasoningEffort,
        fidelityMode: "permissive",
        timeoutMs: 30_000,
      });

      totalLatencyMs += output.latencyMs ?? 0;
      totalTokens += (output.usage?.inputTokens ?? 0) + (output.usage?.outputTokens ?? 0);

      results.push({
        ...identity,
        requestHash,
        output,
        score: scoreFidelityCase(benchmarkCase, output.rewritten),
      });
    } catch (error) {
      results.push({
        ...identity,
        requestHash,
        error: error instanceof Error ? error.message : String(error),
        score: scoreFidelityCase(benchmarkCase, ""),
      });
    }
  }

  const failures = results.filter(
    (result) => result.error !== undefined || !result.score.nonEmpty,
  ).length;
  const meanScore = results.reduce((sum, result) => sum + result.score.total, 0) / results.length;

  return {
    scoreVersion: FIDELITY_SCORE_VERSION,
    corpusHash: hash(cases),
    plan: { profileMode, repeat },
    provider: provider.id,
    model,
    timestamp: new Date().toISOString(),
    results,
    aggregate: {
      cases: results.length,
      failures,
      regressions: results.filter((result) => result.error === undefined && result.score.total < 1)
        .length,
      meanScore,
      totalLatencyMs,
      totalTokens,
    },
  };
}

export function formatFidelityMarkdown(run: FidelityRun): string {
  const lines = [
    "# Reqraft Fidelity Benchmark",
    "",
    `- Provider: ${run.provider}`,
    `- Model: ${run.model}`,
    `- Date: ${run.timestamp}`,
    `- Score version: ${String(run.scoreVersion)}`,
    `- Corpus: ${run.corpusHash}`,
    `- Profile mode: ${run.plan.profileMode}; repeats: ${String(run.plan.repeat)}`,
    `- Cases: ${String(run.aggregate.cases)}`,
    `- Regressions detected by checks: ${String(run.aggregate.regressions)}`,
    ...(run.provider === "mock"
      ? ["> mock provider: harness check only, not a quality measurement."]
      : []),
    `- Failures: ${String(run.aggregate.failures)}`,
    `- Mean score: ${run.aggregate.meanScore.toFixed(2)}`,
    `- Total latency: ${String(run.aggregate.totalLatencyMs)} ms`,
    `- Total tokens: ${String(run.aggregate.totalTokens)}`,
    "",
    "| ID | Requested → applied | Sample | Level | Score | Latency | Forbidden | Output |",
    "|---|---|---:|---|---:|---:|---|---|",
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
      `| ${result.id} | ${result.requestedProfile} → ${result.output?.profile ?? "-"} | ${String(result.sample)} | ${result.level} | ${result.score.total.toFixed(2)} | ${latency} | ${forbidden} | ${output} |`,
    );
  }

  lines.push(
    "",
    "## Human review",
    "",
    "A score of 1 only means these checks passed. Review the full input/output pairs below.",
  );
  for (const result of run.results) {
    lines.push(
      "",
      `### ${result.id} · ${result.requestedProfile} · sample ${String(result.sample)}`,
      "",
      result.reviewFocus ?? "Check meaning, tone and scope preservation.",
      "",
      "Input:",
      "",
      ...result.input.split("\n").map((line) => `    ${line}`),
      "",
      "Output:",
      "",
      ...(result.error ?? result.output?.rewritten ?? "").split("\n").map((line) => `    ${line}`),
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const command = new Command()
    .argument("[provider]", "provider id", "mock")
    .argument("[model]", "model id")
    .addOption(
      new Option("--suite <suite>", "case subset").choices(["all", "conversation"]).default("all"),
    )
    .addOption(
      new Option("--profile-mode <mode>", "requested profiles")
        .choices(["explicit", "auto", "both"])
        .default("explicit"),
    )
    .option("--repeat <count>", "samples per case and profile (1–10)", Number, 1)
    .option("--case <id>", "select one case by its exact id")
    .parse();
  const [provider = "mock", model] = command.args;
  const options = command.opts<{
    suite: "all" | "conversation";
    profileMode: FidelityPlanOptions["profileMode"];
    repeat: number;
    case?: string;
  }>();
  const cases = FIDELITY_BENCHMARK_CASES.filter(
    (entry) =>
      (options.suite === "all" || entry.suite === options.suite) &&
      (options.case === undefined || entry.id === options.case),
  );

  const modelSuffix = model ? ` model=${model}` : "";
  console.log(`Fidelity benchmark provider=${provider}${modelSuffix}`);
  const adapter = createProvider(provider as "mock", process.env);
  const resolved = resolveModel(provider, model, "mock-model");
  const run = await runFidelityBenchmark({
    provider: adapter,
    ...resolved,
    cases,
    profileMode: options.profileMode,
    repeat: options.repeat,
  });

  const outDir = path.join(process.cwd(), "benchmark-results");
  await mkdir(outDir, { recursive: true });

  const baseName = `fidelity-${run.provider}-${run.model}-${run.timestamp}`.replace(
    /[^a-zA-Z0-9._-]/g,
    "-",
  );
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const mdPath = path.join(outDir, `${baseName}.md`);

  await writeFile(jsonPath, JSON.stringify(run, null, 2), "utf8");
  await writeFile(mdPath, formatFidelityMarkdown(run), "utf8");

  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
  console.log(`Mean score: ${run.aggregate.meanScore.toFixed(2)}`);
  console.log(`Failures: ${String(run.aggregate.failures)}/${String(run.aggregate.cases)}`);
  console.log(`Regressions: ${String(run.aggregate.regressions)}/${String(run.aggregate.cases)}`);
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
