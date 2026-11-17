import type { PromptVariant } from "@/core/prompt-builder.js";
import type { LocalModelCase, LocalModelTrap } from "./local-model-cases.js";
import type { LocalModelScore } from "./local-model-scoring.js";

/**
 * What a local-model run produced, and the summary drawn from it.
 *
 * Pure aggregation and formatting, apart from the runner, so the report can be
 * checked in `pnpm test` with fabricated rows.
 */

export interface LocalCaseRun {
  id: string;
  level: LocalModelCase["level"];
  language: LocalModelCase["language"];
  trap: LocalModelTrap;
  sample: number;
  input: string;
  output?: string;
  error?: string;
  /** The profile the model reported for the `auto` request. */
  profile?: string;
  /** The answer parsed as the JSON envelope, rather than taken as raw text. */
  structured: boolean;
  score: LocalModelScore;
  /** From the start of the request: first line of any kind, first visible text, end. */
  timing: { firstActivityMs?: number; firstVisibleMs?: number; totalMs: number };
  usage: { inputTokens?: number; outputTokens?: number };
  reviewFocus: string;
}

export interface LocalModelRun {
  model: string;
  variant: PromptVariant;
  /** The warm-up call: loading the model, then a one-word rewrite. */
  loadMs?: number;
  loadError?: string;
  cases: LocalCaseRun[];
}

export interface LocalModelSummary {
  model: string;
  variant: PromptVariant;
  cases: number;
  errors: number;
  structuredRate: number;
  meaning: number;
  language: number;
  level: number;
  facts: number;
  chatter: number;
  total: number;
  /** Cases that passed every check. */
  perfect: number;
  promptTokens?: number;
  loadMs?: number;
  firstVisibleMedianMs?: number;
  firstVisibleP90Ms?: number;
  totalMedianMs?: number;
  tokensPerSecond?: number;
  byTrap: Partial<Record<LocalModelTrap, number>>;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The value below which `fraction` of the sorted values fall (nearest rank). */
export function percentile(values: readonly number[], fraction: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[rank];
}

function defined(values: readonly (number | undefined)[]): number[] {
  return values.filter((value): value is number => value !== undefined);
}

/**
 * Output tokens over the time spent writing them: from the first visible text
 * to the end, so the model's loading and prompt reading are left out.
 */
export function tokensPerSecond(run: LocalCaseRun): number | undefined {
  const { outputTokens } = run.usage;
  const start = run.timing.firstVisibleMs;
  if (outputTokens === undefined || start === undefined) return undefined;
  const seconds = (run.timing.totalMs - start) / 1000;
  return seconds > 0 && outputTokens > 1 ? (outputTokens - 1) / seconds : undefined;
}

export function summarizeLocalRun(run: LocalModelRun): LocalModelSummary {
  const rows = run.cases;
  const scored = (pick: (score: LocalModelScore) => number): number =>
    mean(rows.map((row) => pick(row.score)));
  const traps = [...new Set(rows.map((row) => row.trap))];
  const median = (values: readonly (number | undefined)[]): number | undefined =>
    percentile(defined(values), 0.5);

  return {
    model: run.model,
    variant: run.variant,
    cases: rows.length,
    errors: rows.filter((row) => row.error !== undefined).length,
    structuredRate: mean(rows.map((row) => (row.structured ? 1 : 0))),
    meaning: scored((score) => score.meaning),
    language: scored((score) => score.language),
    level: scored((score) => score.level),
    facts: scored((score) => score.facts),
    chatter: scored((score) => score.chatter),
    total: scored((score) => score.total),
    perfect: rows.filter((row) => row.score.total === 1).length,
    promptTokens: median(rows.map((row) => row.usage.inputTokens)),
    loadMs: run.loadMs,
    firstVisibleMedianMs: median(rows.map((row) => row.timing.firstVisibleMs)),
    firstVisibleP90Ms: percentile(defined(rows.map((row) => row.timing.firstVisibleMs)), 0.9),
    totalMedianMs: median(rows.map((row) => row.timing.totalMs)),
    tokensPerSecond: median(rows.map(tokensPerSecond)),
    byTrap: Object.fromEntries(
      traps.map((trap) => [
        trap,
        mean(rows.filter((row) => row.trap === trap).map((row) => row.score.total)),
      ]),
    ),
  };
}

const TRAPS: readonly LocalModelTrap[] = [
  "names",
  "numbers",
  "code",
  "injection",
  "clean",
  "mixed",
  "fragment",
  "scope",
];

function fixed(value: number | undefined, digits = 2): string {
  return value === undefined ? "–" : value.toFixed(digits);
}

function seconds(ms: number | undefined): string {
  return ms === undefined ? "–" : `${(ms / 1000).toFixed(1)} s`;
}

/** One line of a table cell: pipes escaped, line breaks flattened, bounded. */
function cell(text: string, length = 110): string {
  const flat = text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

export interface LocalReportContext {
  baseUrl: string;
  machine: string;
  timestamp: string;
  scoreVersion: number;
  corpusHash: string;
  repeat: number;
}

export function formatLocalModelMarkdown(
  context: LocalReportContext,
  runs: readonly LocalModelRun[],
): string {
  const summaries = runs.map(summarizeLocalRun);
  const lines = [
    "# Reqraft local model benchmark",
    "",
    `- Server: ${context.baseUrl}`,
    `- Machine: ${context.machine}`,
    `- Date: ${context.timestamp}`,
    `- Score version: ${String(context.scoreVersion)}; corpus: ${context.corpusHash.slice(0, 12)}; repeats: ${String(context.repeat)}`,
    "- Each dimension is a mean between 0 and 1; `Perfect` counts the cases that passed every check.",
    "",
    "| Model | Prompt | Score | Meaning | Language | Level | Facts | Chatter | JSON | Errors | Perfect | Prompt tokens | Load | First text (median / p90) | Total (median) | Tokens/s |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const summary of summaries) {
    lines.push(
      `| ${summary.model} | ${summary.variant} | ${fixed(summary.total)} | ${fixed(summary.meaning)} | ${fixed(summary.language)} | ${fixed(summary.level)} | ${fixed(summary.facts)} | ${fixed(summary.chatter)} | ${fixed(summary.structuredRate)} | ${String(summary.errors)} | ${String(summary.perfect)}/${String(summary.cases)} | ${fixed(summary.promptTokens, 0)} | ${seconds(summary.loadMs)} | ${seconds(summary.firstVisibleMedianMs)} / ${seconds(summary.firstVisibleP90Ms)} | ${seconds(summary.totalMedianMs)} | ${fixed(summary.tokensPerSecond, 0)} |`,
    );
  }

  lines.push(
    "",
    "## Score by trap",
    "",
    `| Model | Prompt | ${TRAPS.join(" | ")} |`,
    `|---|---|${TRAPS.map(() => "---:").join("|")}|`,
  );
  for (const summary of summaries) {
    lines.push(
      `| ${summary.model} | ${summary.variant} | ${TRAPS.map((trap) => fixed(summary.byTrap[trap])).join(" | ")} |`,
    );
  }

  for (const run of runs) {
    lines.push(
      "",
      `## ${run.model} · ${run.variant}`,
      "",
      ...(run.loadError === undefined ? [] : [`Warm-up failed: ${cell(run.loadError, 300)}`, ""]),
      "| Case | Level | Score | Notes | Output |",
      "|---|---|---:|---|---|",
    );
    for (const row of run.cases) {
      lines.push(
        `| ${row.id} | ${row.level} | ${fixed(row.score.total)} | ${cell(row.score.notes.join("; ") || "–", 80)} | ${cell(row.error ?? row.output ?? "")} |`,
      );
    }
  }

  lines.push(
    "",
    "## Full outputs, for review",
    "",
    "The checks are mechanical: read the outputs before trusting a total.",
  );
  for (const run of runs) {
    for (const row of run.cases) {
      lines.push(
        "",
        `### ${run.model} · ${run.variant} · ${row.id}`,
        "",
        row.reviewFocus,
        "",
        "Input:",
        "",
        ...row.input.split("\n").map((line) => `    ${line}`),
        "",
        "Output:",
        "",
        ...(row.error ?? row.output ?? "").split("\n").map((line) => `    ${line}`),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
