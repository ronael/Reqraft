import process from "node:process";
import type { FidelityMode, RepromptResult } from "@/core/types.js";
import { parseLevel } from "@/core/levels.js";
import { readClipboard, writeClipboard } from "@/apps/cli/clipboard/clipboard.js";
import { readFileContent, readStdin } from "@/utils/input.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { loadConfig } from "@/config/loader.js";
import { detectSecrets } from "@/core/secret-detector.js";
import { redactSecrets } from "@/utils/redaction.js";
import { executeReprompt, type ExecuteRepromptInput } from "@/application/reprompt.js";
import type { Config } from "@/config/schema.js";
import { getFallbackModelForProvider } from "@/models/presets.js";
import {
  formatCost,
  formatDuration,
  formatTokenValue,
  qualityLabel,
} from "@/apps/cli/ui/formatters.js";
import { ansi, ANSI, type AnsiStyleOptions } from "@/apps/cli/ui/ansi.js";
import { detectCapabilities } from "@/apps/cli/ui/theme/capabilities.js";
import { describeQualitySignal, visibleQualitySignals } from "@/apps/cli/ui/quality.js";
import { serializeJsonError, serializeJsonSuccess } from "@/apps/cli/presentation/json-contract.js";
import { normalizeReqraftError, ReqraftError } from "@/core/errors.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { formatUiError } from "@/shared/errors.js";

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
  outputLanguage?: string;
}

interface RepromptOutput {
  log(message: string): void;
  error(message: string): void;
}

const DEFAULT_TRANSLATOR = createTranslator("fr");

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
  t: Translator,
): { input?: string; exitCode?: number } {
  const secrets = detectSecrets(input);
  if (secrets.length === 0 || options.force) {
    return { input };
  }
  if (options.redactSecrets) {
    return { input: redactSecrets(input) };
  }

  output.error(t("reprompt.secretDetected"));
  for (const secret of secrets) {
    output.error(`  - ${secret.type}`);
  }
  output.error(t("reprompt.secretAdvice"));
  return { exitCode: EXIT_CODES.SECRET_DETECTED };
}

function reportFatalError(
  error: unknown,
  verbose: boolean,
  output: RepromptOutput,
  provider: string,
  t: Translator,
): number {
  output.error(`${t("common.error")} : ${formatUiError(error, provider, t)}`);
  if (verbose && error instanceof ReqraftError && error.detail) {
    output.error(error.detail);
  }
  return error instanceof ReqraftError ? error.exitCode : EXIT_CODES.GENERAL_ERROR;
}

export async function runReprompt(
  options: RepromptCliOptions,
  output: RepromptOutput = console,
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  try {
    const config = await loadConfig();
    const rawInput = await resolveInput(options);
    if (!rawInput) {
      output.error(t("reprompt.inputMissing"));
      return EXIT_CODES.INVALID_INPUT;
    }

    const secretPolicy = applySecretPolicy(rawInput, options, output, t);
    if (secretPolicy.exitCode !== undefined) {
      return secretPolicy.exitCode;
    }
    const input = secretPolicy.input ?? rawInput;
    const { result, detectedProfile } = await executeReprompt(
      createCliRepromptInput(input, config, options, process.env),
    );

    if (detectedProfile && options.verbose) {
      output.error(t("reprompt.profileDetected", { profile: result.profile }));
    }

    return await outputResult(result, options, config.showStats, output, t);
  } catch (error) {
    if (options.json) {
      const normalized = normalizeReqraftError(error);
      output.log(serializeJsonError(normalized));
      return normalized.exitCode;
    }
    return reportFatalError(
      error,
      options.verbose ?? false,
      output,
      options.provider ?? "provider",
      t,
    );
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
      "maxOutputTokens",
      options.maxOutputTokens,
      config.maxOutputTokens,
    ),
    outputLanguage:
      (options.outputLanguage ?? config.outputLanguage) === "auto"
        ? undefined
        : (options.outputLanguage ?? config.outputLanguage),
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
  return resolvePositiveInteger("timeout", option, configured) ?? configured;
}

function resolvePositiveInteger(
  optionName: "timeout" | "maxOutputTokens",
  option: string | undefined,
  configured: number | undefined,
): number | undefined {
  if (option === undefined) return configured;
  const value = Number(option);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ReqraftError("runtime.option_invalid", EXIT_CODES.INVALID_INPUT, {
      params: { option: optionName, expected: "positive_integer" },
    });
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
  t: Translator,
): void {
  const style = quickOutputStyle();
  if (options.json) {
    output.log(serializeJsonSuccess(result));
    return;
  }
  if (options.diff) {
    output.log(formatDiff(result.original, result.rewritten, style));
    return;
  }
  output.log(result.rewritten);
  if (options.explain) {
    output.error(formatExplain(result, style, t));
  }
}

async function outputResult(
  result: RepromptResult,
  options: RepromptCliOptions,
  defaultShowStats: boolean,
  output: RepromptOutput,
  t: Translator,
): Promise<number> {
  writePrimaryOutput(result, options, output, t);

  const showsDetailedQuality =
    !options.json && !options.explain && visibleQualitySignals(result.quality).length > 0;
  if (showsDetailedQuality) {
    output.error("");
    output.error(formatQuality(result, quickOutputStyle(), t));
  }

  if (!options.json && (options.stats ?? defaultShowStats)) {
    output.error("");
    output.error(
      formatStats(
        result,
        {
          ...quickOutputStyle(),
          includeQuality: !showsDetailedQuality,
        },
        t,
      ),
    );
  }

  if (options.copy) {
    await writeClipboard(result.rewritten);
    output.error(t("reprompt.copied"));
  }

  if (options.failOnQuality && result.quality.status !== "good") {
    return EXIT_CODES.QUALITY_REVIEW;
  }
  return EXIT_CODES.SUCCESS;
}

export function formatStats(
  result: RepromptResult,
  options: AnsiStyleOptions & { includeQuality?: boolean } = {},
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  const color = options.color ?? false;
  const metric = (label: string, value: string): string =>
    `${ansi(label, ANSI.dim, color)} ${value}`;
  const lines = [ansi(t("stats.title"), ANSI.boldAccent, color)];
  if (result.latencyMs !== undefined) {
    lines.push(metric(t("stats.duration"), formatDuration(result.latencyMs)));
  }
  lines.push(metric(t("stats.input"), formatTokenValue(result.usage?.inputTokens, t)));
  lines.push(
    metric(t("stats.visibleOutput"), formatTokenValue(result.usage?.visibleOutputTokens, t)),
  );
  lines.push(metric(t("stats.reasoning"), formatTokenValue(result.usage?.reasoningTokens, t)));
  lines.push(metric(t("stats.totalOutput"), formatTokenValue(result.usage?.outputTokens, t)));

  if (result.usage?.estimatedCost !== undefined) {
    lines.push(
      metric(
        t("stats.estimatedCost"),
        formatCost(result.usage.estimatedCost, result.usage.currency),
      ),
    );
  } else {
    lines.push(metric(t("stats.estimatedCost"), t("stats.unavailable")));
  }

  lines.push(
    `${ansi(t("stats.provider"), ANSI.dim, color)} ${ansi(result.provider, ANSI.accent, color)} · ${ansi(t("stats.model"), ANSI.dim, color)} ${ansi(result.model, ANSI.accent, color)}`,
  );
  if (options.includeQuality ?? true) {
    const qualityColor = result.quality.status === "good" ? ANSI.success : ANSI.warning;
    lines.push(
      `${ansi(t("stats.quality"), ANSI.dim, color)} ${ansi(qualityLabel(result.quality.status, t), qualityColor, color)}`,
    );
  }
  return lines.join("\n");
}

export function formatQuality(
  result: RepromptResult,
  options: AnsiStyleOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  const color = options.color ?? false;
  const separatorCharacter = options.unicode === false ? "-" : "─";
  const lines = [
    ansi(separatorCharacter.repeat(40), ANSI.dim, color),
    ansi(
      result.quality.status === "risky" ? t("quality.risky") : t("quality.review"),
      ANSI.boldWarning,
      color,
    ),
  ];
  for (const signal of visibleQualitySignals(result.quality)) {
    lines.push(`${ansi("!", ANSI.warning, color)} ${describeQualitySignal(signal, t)}`);
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

export function formatExplain(
  result: RepromptResult,
  options: AnsiStyleOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  const color = options.color ?? false;
  const bullet = options.unicode === false ? ">" : "›";
  const lines = [`${ansi(t("explain.changes"), ANSI.boldAccent, color)} :`];
  for (const change of result.changes) {
    lines.push(`${ansi(bullet, ANSI.accent, color)} ${change}`);
  }
  const signals = visibleQualitySignals(result.quality);
  if (signals.length > 0) {
    lines.push("");
    lines.push(`${ansi(t("explain.warnings"), ANSI.warning, color)} :`);
    for (const signal of signals) {
      lines.push(`${ansi("!", ANSI.warning, color)} ${describeQualitySignal(signal, t)}`);
    }
  }
  return lines.join("\n");
}

function quickOutputStyle(): Required<AnsiStyleOptions> {
  const capabilities = detectCapabilities(process.env, process.stdout.isTTY, process.platform);
  return { color: capabilities.color, unicode: capabilities.unicode };
}
