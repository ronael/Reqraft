import process from "node:process";
import type { RepromptResult } from "../core/types.js";
import { rewrite } from "../core/engine.js";
import { parseLevel } from "../core/levels.js";
import { resolveProfile } from "../profiles/registry.js";
import { createProvider } from "../providers/registry.js";
import { resolveModel } from "../models/model-resolver.js";
import { readClipboard, writeClipboard } from "../clipboard/clipboard.js";
import { readFileContent, readStdin } from "../utils/input.js";
import { EXIT_CODES } from "../utils/exit-codes.js";
import { loadConfig } from "../config/loader.js";
import { detectSecrets } from "../core/secret-detector.js";
import { redactSecrets } from "../utils/redaction.js";
import { hydrateCredentials } from "../auth/credentials.js";

export interface RepromptCliOptions {
  text?: string;
  profile?: string;
  level?: string;
  provider?: string;
  model?: string;
  copy?: boolean;
  clipboard?: boolean;
  file?: string;
  json?: boolean;
  diff?: boolean;
  explain?: boolean;
  stats?: boolean;
  fidelity?: "permissive" | "balanced" | "strict";
  stream?: boolean;
  timeout?: string;
  maxOutputTokens?: string;
  failOnQuality?: boolean;
  verbose?: boolean;
  force?: boolean;
  redactSecrets?: boolean;
}

/**
 * Applies the local secret policy before any text leaves the machine.
 *
 * Returns the text to send: redacted on --redact-secrets, unchanged on
 * --force. Otherwise the run stops with SECRET_DETECTED.
 */
function applySecretPolicy(input: string, options: RepromptCliOptions): string {
  const secrets = detectSecrets(input);
  if (secrets.length === 0 || options.force) {
    return input;
  }
  if (options.redactSecrets) {
    return redactSecrets(input);
  }

  console.error("Un secret potentiel a été détecté dans le texte.");
  for (const secret of secrets) {
    console.error(`  - ${secret.type}`);
  }
  console.error(
    "Utilisez --redact-secrets pour masquer automatiquement ou --force pour continuer.",
  );
  process.exit(EXIT_CODES.SECRET_DETECTED);
}

function reportFatalError(error: unknown, verbose: boolean): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Erreur : ${message}`);
  if (verbose && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(EXIT_CODES.GENERAL_ERROR);
}

export async function runReprompt(options: RepromptCliOptions): Promise<void> {
  try {
    const config = await loadConfig();
    await hydrateCredentials(process.env);
    const rawInput = await resolveInput(options);
    if (!rawInput) {
      console.error("Aucune entrée fournie. Utilisez rp --help pour voir les options.");
      process.exit(EXIT_CODES.INVALID_INPUT);
    }

    const input = applySecretPolicy(rawInput, options);
    const level = parseLevel(options.level ?? config.defaultLevel);
    const { profile, detected } = resolveProfile(options.profile ?? config.defaultProfile, input);
    const providerId = options.provider ?? config.defaultProvider;
    const provider = createProvider(providerId as "mock", process.env, config);
    const { model, reasoningEffort } = resolveModel(providerId, options.model, config.defaultModel);

    const result = await rewrite({
      input,
      profile,
      level,
      provider,
      model,
      includeChanges: options.explain ?? options.json ?? config.showChanges,
      stream: options.stream ?? config.stream,
      reasoningEffort,
      fidelityMode: options.fidelity ?? config.fidelityMode,
      timeoutMs: resolveTimeout(options.timeout, config.timeoutMs),
      maxOutputTokens: resolvePositiveInteger(
        "La limite de sortie",
        options.maxOutputTokens,
        config.maxOutputTokens,
      ),
    });

    if (detected && options.verbose) {
      console.error(`Profil détecté : ${profile.id}`);
    }

    await outputResult(result, options, config.showStats);
  } catch (error) {
    reportFatalError(error, options.verbose ?? false);
  }
}

function resolveTimeout(option: string | undefined, configured: number): number {
  return resolvePositiveInteger("Le timeout", option, configured) ?? configured;
}

function resolvePositiveInteger(
  label: string,
  option: string | undefined,
  configured: number | undefined,
): number | undefined {
  if (option === undefined) return configured;
  const value = Number(option);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} doit être un entier strictement positif.`);
  }
  return value;
}

async function resolveInput(options: RepromptCliOptions): Promise<string> {
  if (options.clipboard) {
    return await readClipboard();
  }
  if (options.file) {
    return await readFileContent(options.file);
  }
  if (options.text) {
    return options.text;
  }
  if (!process.stdin.isTTY) {
    return await readStdin();
  }
  return "";
}

/**
 * Writes the prompt itself.
 *
 * The rewritten prompt always goes to stdout so the command stays pipeable;
 * only explanations are pushed to stderr.
 */
function writePrimaryOutput(result: RepromptResult, options: RepromptCliOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.diff) {
    console.log(formatDiff(result.original, result.rewritten));
    return;
  }
  console.log(result.rewritten);
  if (options.explain) {
    console.error(formatExplain(result));
  }
}

async function outputResult(
  result: RepromptResult,
  options: RepromptCliOptions,
  defaultShowStats: boolean,
): Promise<void> {
  writePrimaryOutput(result, options);

  if (!options.json && !options.explain && result.warnings.length > 0) {
    console.error("");
    console.error(formatQuality(result));
  }

  if (!options.json && (options.stats ?? defaultShowStats)) {
    console.error("");
    console.error(formatStats(result));
  }

  if (options.copy) {
    await writeClipboard(result.rewritten);
    console.error("Résultat copié dans le presse-papiers.");
  }

  if (options.failOnQuality && result.quality.status !== "good") {
    process.exitCode = EXIT_CODES.QUALITY_REVIEW;
  }
}

function formatStats(result: RepromptResult): string {
  const lines = ["Stats"];
  if (result.latencyMs !== undefined) {
    lines.push(`Durée ${formatDuration(result.latencyMs)}`);
  }
  lines.push(`Entrée ${formatTokenValue(result.usage?.inputTokens)}`);
  lines.push(`Sortie visible ${formatTokenValue(result.usage?.visibleOutputTokens)}`);
  lines.push(`Raisonnement ${formatTokenValue(result.usage?.reasoningTokens)}`);
  lines.push(`Sortie totale ${formatTokenValue(result.usage?.outputTokens)}`);

  if (result.usage?.estimatedCost !== undefined) {
    lines.push(`Coût estimé ${formatCost(result.usage.estimatedCost, result.usage.currency)}`);
  } else {
    lines.push("Coût estimé non disponible");
  }

  lines.push(`Provider ${result.provider} · Modèle ${result.model}`);
  lines.push(`Qualité ${qualityLabel(result.quality.status)}`);
  return lines.join("\n");
}

export function formatQuality(result: RepromptResult): string {
  const lines = [`Qualité ${qualityLabel(result.quality.status)}`];
  for (const warning of result.warnings) {
    lines.push(`- ${warning}`);
  }
  return lines.join("\n");
}

function qualityLabel(status: RepromptResult["quality"]["status"]): string {
  switch (status) {
    case "risky":
      return "risquée";
    case "review":
      return "à vérifier";
    case "good":
    default:
      return "correcte";
  }
}

function formatTokenValue(value: number | undefined): string {
  return value === undefined ? "non communiqué" : `${String(value)} tokens`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${String(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatCost(cost: number, currency?: string): string {
  const suffix = currency ? ` ${currency}` : "";
  return `${cost.toFixed(6)}${suffix}`;
}

function formatDiff(original: string, rewritten: string): string {
  const originalLines = original.split("\n");
  const rewrittenLines = rewritten.split("\n");
  const output: string[] = [];
  const maxLines = Math.max(originalLines.length, rewrittenLines.length);

  for (let i = 0; i < maxLines; i++) {
    const originalLine = originalLines[i] ?? "";
    const rewrittenLine = rewrittenLines[i] ?? "";
    if (originalLine !== rewrittenLine) {
      output.push(`- ${originalLine}`);
      output.push(`+ ${rewrittenLine}`);
    } else {
      output.push(`  ${originalLine}`);
    }
  }

  return output.join("\n");
}

function formatExplain(result: RepromptResult): string {
  const lines = ["Modifications :"];
  for (const change of result.changes) {
    lines.push(`- ${change}`);
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Avertissements :");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join("\n");
}
