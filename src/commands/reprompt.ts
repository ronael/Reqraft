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
  verbose?: boolean;
  force?: boolean;
  redactSecrets?: boolean;
}

export async function runReprompt(options: RepromptCliOptions): Promise<void> {
  try {
    const config = await loadConfig();
    let input = await resolveInput(options);
    if (!input) {
      console.error("Aucune entrée fournie. Utilisez rp --help pour voir les options.");
      process.exit(EXIT_CODES.INVALID_INPUT);
    }

    const secrets = detectSecrets(input);
    if (secrets.length > 0 && !options.force) {
      if (options.redactSecrets) {
        input = redactSecrets(input);
      } else {
        console.error("Un secret potentiel a été détecté dans le texte.");
        for (const secret of secrets) {
          console.error(`  - ${secret.type}`);
        }
        console.error("Utilisez --redact-secrets pour masquer automatiquement ou --force pour continuer.");
        process.exit(EXIT_CODES.SECRET_DETECTED);
      }
    }

    const level = parseLevel(options.level ?? config.defaultLevel);
    const { profile, detected } = resolveProfile(options.profile ?? config.defaultProfile, input);
    const providerId = options.provider ?? config.defaultProvider;
    const provider = createProvider(providerId as "mock", process.env, config);
    const { model, reasoningEffort } = resolveModel(
      providerId,
      options.model,
      config.defaultModel,
    );

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
    });

    if (detected && options.verbose) {
      console.error(`Profil détecté : ${profile.id}`);
    }

    await outputResult(result, options, config.showStats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erreur : ${message}`);
    if (options.verbose && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
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

async function outputResult(
  result: RepromptResult,
  options: RepromptCliOptions,
  defaultShowStats: boolean,
): Promise<void> {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.diff) {
    console.log(formatDiff(result.original, result.rewritten));
  } else if (options.explain) {
    console.log(result.rewritten);
    console.error(formatExplain(result));
  } else {
    console.log(result.rewritten);
  }

  if (!options.json && (options.stats ?? defaultShowStats)) {
    console.error("");
    console.error(formatStats(result));
  }

  if (options.copy) {
    await writeClipboard(result.rewritten);
    console.error("Résultat copié dans le presse-papiers.");
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
  return lines.join("\n");
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
