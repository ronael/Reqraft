import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Command, Option } from "commander";
import { rewrite } from "@/core/engine.js";
import type { PromptVariant } from "@/core/prompt-builder.js";
import type { ProviderAdapter, ProviderRequest } from "@/core/types.js";
import { trimTrailingSlashes } from "@/providers/local-endpoint.js";
import { listInstalledModels } from "@/providers/local-servers.js";
import { OpenAICompatibleProvider } from "@/providers/openai-compatible.js";
import { LOCAL_MODEL_CASES, type LocalModelCase } from "./local-model-cases.js";
import {
  formatLocalModelMarkdown,
  summarizeLocalRun,
  type LocalCaseRun,
  type LocalModelRun,
} from "./local-model-report.js";
import { LOCAL_MODEL_SCORE_VERSION, scoreLocalModelCase } from "./local-model-scoring.js";

/**
 * Runs the local-model cases through Reqraft's own path — the engine, the
 * OpenAI-compatible adapter, streaming, the `auto` profile — against a local
 * server, and writes a JSON and a Markdown report to `benchmark-results/`.
 *
 *     pnpm benchmark:local --model qwen3.5:4b --model qwen3.5:9b --variant both
 *
 * Without `--model`, every chat model the server lists is run. Each model
 * first gets one untimed warm-up call, so the first case does not pay for
 * loading it; that call's duration is reported as the load time.
 */

interface RunnerOptions {
  baseUrl: string;
  models: string[];
  variants: PromptVariant[];
  cases: LocalModelCase[];
  repeat: number;
  timeoutMs: number;
}

/** Times what the adapter hears, without changing what it sends. */
function measured(
  provider: ProviderAdapter,
  clock: { firstActivity?: number; firstVisible?: number },
): ProviderAdapter {
  return {
    id: provider.id,
    name: provider.name,
    local: provider.local,
    validateConfiguration: () => provider.validateConfiguration(),
    generate: (request: ProviderRequest) =>
      provider.generate({
        ...request,
        onActivity: () => {
          clock.firstActivity ??= performance.now();
          request.onActivity?.();
        },
        onDelta: (chunk) => {
          clock.firstVisible ??= performance.now();
          request.onDelta?.(chunk);
        },
      }),
  };
}

async function runCase(
  provider: ProviderAdapter,
  model: string,
  variant: PromptVariant,
  benchmarkCase: LocalModelCase,
  sample: number,
  timeoutMs: number,
): Promise<LocalCaseRun> {
  const clock: { firstActivity?: number; firstVisible?: number } = {};
  const start = performance.now();
  const since = (time: number | undefined): number | undefined =>
    time === undefined ? undefined : Math.round(time - start);
  const identity = {
    id: benchmarkCase.id,
    level: benchmarkCase.level,
    language: benchmarkCase.language,
    trap: benchmarkCase.trap,
    sample,
    input: benchmarkCase.input,
    reviewFocus: benchmarkCase.reviewFocus,
  };
  try {
    const result = await rewrite({
      input: benchmarkCase.input,
      profile: "auto",
      level: benchmarkCase.level,
      provider: measured(provider, clock),
      model,
      // What every surface sends (`core/rewrite-options.ts`).
      includeChanges: true,
      stream: true,
      timeoutMs,
      promptVariant: variant,
    });
    return {
      ...identity,
      output: result.rewritten,
      profile: result.profile,
      structured: !result.quality.signals.some((signal) => signal.code === "unstructured_response"),
      score: scoreLocalModelCase(benchmarkCase, result.rewritten),
      timing: {
        firstActivityMs: since(clock.firstActivity),
        firstVisibleMs: since(clock.firstVisible),
        totalMs: Math.round(performance.now() - start),
      },
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      },
    };
  } catch (error) {
    return {
      ...identity,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      structured: false,
      score: scoreLocalModelCase(benchmarkCase, ""),
      timing: { totalMs: Math.round(performance.now() - start) },
      usage: {},
    };
  }
}

/** Loads the model with a one-word rewrite, so no case pays for it. */
async function warmUp(
  provider: ProviderAdapter,
  model: string,
  variant: PromptVariant,
  timeoutMs: number,
): Promise<{ loadMs?: number; loadError?: string }> {
  const start = performance.now();
  try {
    await rewrite({
      input: "bonjour",
      profile: "auto",
      level: "minimal",
      provider,
      model,
      includeChanges: true,
      stream: true,
      timeoutMs,
      promptVariant: variant,
    });
    return { loadMs: Math.round(performance.now() - start) };
  } catch (error) {
    return { loadError: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Asks Ollama to release a model once its cases are done, so the next one is
 * measured without the previous one still holding memory. Best effort, and
 * Ollama only: LM Studio and others have no such call.
 */
async function releaseOllamaModel(baseUrl: string, model: string): Promise<void> {
  if (!baseUrl.includes(":11434")) return;
  try {
    await fetch(`${trimTrailingSlashes(baseUrl).replace(/\/v1$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
  } catch {
    // Nothing to release, or nothing listening: the next model loads anyway.
  }
}

/** One model with one prompt: the warm-up, then every case. */
async function runModel(
  provider: ProviderAdapter,
  model: string,
  variant: PromptVariant,
  options: RunnerOptions,
): Promise<LocalModelRun> {
  console.log(`→ ${model} · ${variant}: warming up`);
  const run: LocalModelRun = {
    model,
    variant,
    ...(await warmUp(provider, model, variant, options.timeoutMs)),
    cases: [],
  };
  const plan = options.cases.flatMap((benchmarkCase) =>
    Array.from({ length: options.repeat }, (_, index) => ({ benchmarkCase, sample: index + 1 })),
  );
  for (const { benchmarkCase, sample } of plan) {
    const row = await runCase(provider, model, variant, benchmarkCase, sample, options.timeoutMs);
    run.cases.push(row);
    const failure = row.error === undefined ? "" : ` ${row.error}`;
    console.log(
      `  ${row.id}#${String(sample)} ${row.score.total.toFixed(2)} ${String(row.timing.totalMs)} ms${failure}`,
    );
  }
  const summary = summarizeLocalRun(run);
  console.log(
    `  = ${summary.total.toFixed(3)} (${String(summary.perfect)}/${String(summary.cases)} perfect, ${String(summary.errors)} errors)`,
  );
  return run;
}

export async function runLocalModelBenchmark(options: RunnerOptions): Promise<LocalModelRun[]> {
  const provider = new OpenAICompatibleProvider("Local server", { baseUrl: options.baseUrl });
  const runs: LocalModelRun[] = [];
  for (const model of options.models) {
    for (const variant of options.variants) {
      runs.push(await runModel(provider, model, variant, options));
    }
    await releaseOllamaModel(options.baseUrl, model);
  }
  return runs;
}

function machineDescription(): string {
  const cpu = os.cpus()[0]?.model ?? "unknown CPU";
  const memoryGb = Math.round(os.totalmem() / 1024 ** 3);
  return `${cpu}, ${String(memoryGb)} GB, ${process.platform} ${process.arch}`;
}

async function main(): Promise<void> {
  const command = new Command()
    .option("--base-url <url>", "OpenAI-compatible server", "http://localhost:11434/v1")
    .option(
      "--model <id>",
      "model to run (repeatable)",
      (value: string, all: string[]) => [...all, value],
      [],
    )
    .addOption(
      new Option("--variant <variant>", "system prompt")
        .choices(["compact", "full", "both"])
        .default("compact"),
    )
    .option("--case <id>", "run only this case")
    .option("--repeat <count>", "samples per case (1–5)", Number, 1)
    .option("--timeout <ms>", "first-token and idle timeout", Number, 120_000)
    .parse();
  const flags = command.opts<{
    baseUrl: string;
    model: string[];
    variant: "compact" | "full" | "both";
    case?: string;
    repeat: number;
    timeout: number;
  }>();
  if (!Number.isInteger(flags.repeat) || flags.repeat < 1 || flags.repeat > 5) {
    throw new Error("--repeat must be an integer between 1 and 5.");
  }

  const models =
    flags.model.length > 0
      ? flags.model
      : await listInstalledModels({ baseUrl: flags.baseUrl, label: "Local server" });
  if (models.length === 0) throw new Error(`No chat model is installed on ${flags.baseUrl}.`);
  const cases = LOCAL_MODEL_CASES.filter(
    (entry) => flags.case === undefined || entry.id === flags.case,
  );
  if (cases.length === 0) throw new Error(`No case is named ${flags.case ?? ""}.`);
  const variants: PromptVariant[] =
    flags.variant === "both" ? ["compact", "full"] : [flags.variant];

  const runs = await runLocalModelBenchmark({
    baseUrl: flags.baseUrl,
    models,
    variants,
    cases,
    repeat: flags.repeat,
    timeoutMs: flags.timeout,
  });

  const timestamp = new Date().toISOString();
  const context = {
    baseUrl: flags.baseUrl,
    machine: machineDescription(),
    timestamp,
    scoreVersion: LOCAL_MODEL_SCORE_VERSION,
    corpusHash: createHash("sha256").update(JSON.stringify(cases)).digest("hex"),
    repeat: flags.repeat,
  };
  const outDir = path.join(process.cwd(), "benchmark-results");
  await mkdir(outDir, { recursive: true });
  const baseName = `local-models-${timestamp}`.replace(/[^a-zA-Z0-9._-]/g, "-");
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const mdPath = path.join(outDir, `${baseName}.md`);
  await writeFile(
    jsonPath,
    JSON.stringify({ ...context, runs, summaries: runs.map(summarizeLocalRun) }, null, 2),
    "utf8",
  );
  await writeFile(mdPath, formatLocalModelMarkdown(context, runs), "utf8");
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
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
