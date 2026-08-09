import process from "node:process";
import type { FidelityMode, RepromptResult } from "../core/types.js";
import { parseLevel } from "../core/levels.js";
import { readClipboard, writeClipboard } from "../clipboard/clipboard.js";
import { readFileContent, readStdin } from "../utils/input.js";
import { EXIT_CODES } from "../utils/exit-codes.js";
import { loadConfig } from "../config/loader.js";
import { detectSecrets } from "../core/secret-detector.js";
import { redactSecrets } from "../utils/redaction.js";
import { executeReprompt, type ExecuteRepromptInput } from "../application/reprompt.js";
import type { Config } from "../config/schema.js";
import { getFallbackModelForProvider } from "../models/presets.js";
import { formatCost, formatDuration, formatTokenValue, qualityLabel } from "../ui/formatters.js";
import { ansi, ANSI, type AnsiStyleOptions } from "../ui/ansi.js";
import { detectCapabilities } from "../ui/theme/capabilities.js";

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
  fidelity?: FidelityMode;
  stream?: boolean;
  timeout?: string;
  maxOutputTokens?: string;
  failOnQuality?: boolean;
  verbose?: boolean;
  force?: boolean;
  redactSecrets?: boolean;
}

interface RepromptOutput {
  log(message: string): void;
  error(message: string): void;
}

/**
 * Applies the local secret policy before any text leaves the machine.
 *
 * Returns the text to send: redacted on --redact-secrets, unchanged on
 * --force. Otherwise the run stops with SECRET_DETECTED.
 */
function applySecretPolicy(
  input: string,
  options: RepromptCliOptions,
  output: RepromptOutput,
): { input?: string; exitCode?: number } {
  const secrets = detectSecrets(input);
  if (secrets.length === 0 || options.force) {
    return { input };
  }
  if (options.redactSecrets) {
    return { input: redactSecrets(input) };
  }

  output.error("Un secret potentiel a été détecté dans le texte.");
  for (const secret of secrets) {
    output.error(`  - ${secret.type}`);
  }
  output.error("Utilisez --redact-secrets pour masquer automatiquement ou --force pour continuer.");
  return { exitCode: EXIT_CODES.SECRET_DETECTED };
}

function reportFatalError(error: unknown, verbose: boolean, output: RepromptOutput): number {
  const message = error instanceof Error ? error.message : String(error);
  output.error(`Erreur : ${message}`);
  if (verbose && error instanceof Error && error.stack) {
    output.error(error.stack);
  }
  return EXIT_CODES.GENERAL_ERROR;
}

export async function runReprompt(
  options: RepromptCliOptions,
  output: RepromptOutput = console,
): Promise<number> {
  try {
    const config = await loadConfig();
    const rawInput = await resolveInput(options);
    if (!rawInput) {
      output.error("Aucune entrée fournie. Utilisez rp --help pour voir les options.");
      return EXIT_CODES.INVALID_INPUT;
    }

    const secretPolicy = applySecretPolicy(rawInput, options, output);
    if (secretPolicy.exitCode !== undefined) {
      return secretPolicy.exitCode;
    }
    const input = secretPolicy.input ?? rawInput;
    const { result, detectedProfile } = await executeReprompt(
      createCliRepromptInput(input, config, options, process.env),
    );

    if (detectedProfile && options.verbose) {
      output.error(`Profil détecté : ${result.profile}`);
    }

    return await outputResult(result, options, config.showStats, output);
  } catch (error) {
    return reportFatalError(error, options.verbose ?? false, output);
  }
}

export function createCliRepromptInput(
  input: string,
  config: Config,
  options: RepromptCliOptions,
  env: NodeJS.ProcessEnv,
): ExecuteRepromptInput {
  return {
    input,
    profileId: options.profile ?? config.defaultProfile,
    level: parseLevel(options.level ?? config.defaultLevel),
    providerId: options.provider ?? config.defaultProvider,
    requestedModel: resolveRequestedModel(config, options),
    defaultModel: config.defaultModel,
    env,
    config,
    stream: options.stream ?? config.stream,
    fidelityMode: options.fidelity ?? config.fidelityMode,
    timeoutMs: resolveTimeout(options.timeout, config.timeoutMs),
    maxOutputTokens: resolvePositiveInteger(
      "La limite de sortie",
      options.maxOutputTokens,
      config.maxOutputTokens,
    ),
  };
}

function resolveRequestedModel(config: Config, options: RepromptCliOptions): string {
  if (options.model) return options.model;
  if (options.provider && options.provider !== config.defaultProvider) {
    return getFallbackModelForProvider(options.provider) ?? config.defaultModel;
  }
  return config.defaultModel;
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
function writePrimaryOutput(
  result: RepromptResult,
  options: RepromptCliOptions,
  output: RepromptOutput,
): void {
  const style = quickOutputStyle();
  if (options.json) {
    output.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.diff) {
    output.log(formatDiff(result.original, result.rewritten, style));
    return;
  }
  output.log(result.rewritten);
  if (options.explain) {
    output.error(formatExplain(result, style));
  }
}

async function outputResult(
  result: RepromptResult,
  options: RepromptCliOptions,
  defaultShowStats: boolean,
  output: RepromptOutput,
): Promise<number> {
  writePrimaryOutput(result, options, output);

  const showsDetailedQuality = !options.json && !options.explain && result.warnings.length > 0;
  if (showsDetailedQuality) {
    output.error("");
    output.error(formatQuality(result, quickOutputStyle()));
  }

  if (!options.json && (options.stats ?? defaultShowStats)) {
    output.error("");
    output.error(
      formatStats(result, {
        ...quickOutputStyle(),
        includeQuality: !showsDetailedQuality,
      }),
    );
  }

  if (options.copy) {
    await writeClipboard(result.rewritten);
    output.error("Résultat copié dans le presse-papiers.");
  }

  if (options.failOnQuality && result.quality.status !== "good") {
    return EXIT_CODES.QUALITY_REVIEW;
  }
  return EXIT_CODES.SUCCESS;
}

export function formatStats(
  result: RepromptResult,
  options: AnsiStyleOptions & { includeQuality?: boolean } = {},
): string {
  const color = options.color ?? false;
  const metric = (label: string, value: string): string =>
    `${ansi(label, ANSI.dim, color)} ${value}`;
  const lines = [ansi("Stats", ANSI.boldAccent, color)];
  if (result.latencyMs !== undefined) {
    lines.push(metric("Durée", formatDuration(result.latencyMs)));
  }
  lines.push(metric("Entrée", formatTokenValue(result.usage?.inputTokens)));
  lines.push(metric("Sortie visible", formatTokenValue(result.usage?.visibleOutputTokens)));
  lines.push(metric("Raisonnement", formatTokenValue(result.usage?.reasoningTokens)));
  lines.push(metric("Sortie totale", formatTokenValue(result.usage?.outputTokens)));

  if (result.usage?.estimatedCost !== undefined) {
    lines.push(
      metric("Coût estimé", formatCost(result.usage.estimatedCost, result.usage.currency)),
    );
  } else {
    lines.push(metric("Coût estimé", "non disponible"));
  }

  lines.push(
    `${ansi("Provider", ANSI.dim, color)} ${ansi(result.provider, ANSI.accent, color)} · ${ansi("Modèle", ANSI.dim, color)} ${ansi(result.model, ANSI.accent, color)}`,
  );
  if (options.includeQuality ?? true) {
    const qualityColor = result.quality.status === "good" ? ANSI.success : ANSI.warning;
    lines.push(
      `${ansi("Qualité", ANSI.dim, color)} ${ansi(qualityLabel(result.quality.status), qualityColor, color)}`,
    );
  }
  return lines.join("\n");
}

export function formatQuality(result: RepromptResult, options: AnsiStyleOptions = {}): string {
  const color = options.color ?? false;
  const separatorCharacter = options.unicode === false ? "-" : "─";
  const lines = [
    ansi(separatorCharacter.repeat(40), ANSI.dim, color),
    ansi(`Qualité ${qualityLabel(result.quality.status)}`, ANSI.boldWarning, color),
  ];
  for (const warning of result.warnings) {
    lines.push(`${ansi("!", ANSI.warning, color)} ${warning}`);
  }
  return lines.join("\n");
}

export function formatDiff(
  original: string,
  rewritten: string,
  options: AnsiStyleOptions = {},
): string {
  const color = options.color ?? false;
  const originalLines = original.split("\n");
  const rewrittenLines = rewritten.split("\n");
  const output: string[] = [];
  const maxLines = Math.max(originalLines.length, rewrittenLines.length);

  for (let i = 0; i < maxLines; i++) {
    const originalLine = originalLines[i] ?? "";
    const rewrittenLine = rewrittenLines[i] ?? "";
    if (originalLine !== rewrittenLine) {
      output.push(ansi(`- ${originalLine}`, ANSI.danger, color));
      output.push(ansi(`+ ${rewrittenLine}`, ANSI.success, color));
    } else {
      output.push(ansi(`  ${originalLine}`, ANSI.dim, color));
    }
  }

  return output.join("\n");
}

export function formatExplain(result: RepromptResult, options: AnsiStyleOptions = {}): string {
  const color = options.color ?? false;
  const bullet = options.unicode === false ? ">" : "›";
  const lines = [`${ansi("Modifications", ANSI.boldAccent, color)} :`];
  for (const change of result.changes) {
    lines.push(`${ansi(bullet, ANSI.accent, color)} ${change}`);
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push(`${ansi("Avertissements", ANSI.warning, color)} :`);
    for (const warning of result.warnings) {
      lines.push(`${ansi("!", ANSI.warning, color)} ${warning}`);
    }
  }
  return lines.join("\n");
}

function quickOutputStyle(): Required<AnsiStyleOptions> {
  const capabilities = detectCapabilities(process.env, process.stdout.isTTY, process.platform);
  return { color: capabilities.color, unicode: capabilities.unicode };
}
