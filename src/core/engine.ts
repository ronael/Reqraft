import type { PromptProfile } from "../profiles/types.js";
import { detectUnsupportedAdditions, isDisproportionateExpansion } from "./fidelity.js";
import { buildPrompt } from "./prompt-builder.js";
import { parseResult } from "./result-parser.js";
import type {
  ProviderAdapter,
  FidelityMode,
  ProviderRequest,
  RepromptLevel,
  RepromptResult,
} from "./types.js";
import { assertNonEmptyResult } from "./validation.js";

export interface EngineOptions {
  input: string;
  profile: PromptProfile;
  level: RepromptLevel;
  provider: ProviderAdapter;
  model: string;
  language?: string;
  includeChanges: boolean;
  stream?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  fidelityMode?: FidelityMode;
}

export async function rewrite(options: EngineOptions): Promise<RepromptResult> {
  const start = Date.now();

  const { systemPrompt, userPrompt } = buildPrompt({
    input: options.input,
    profile: options.profile,
    level: options.level,
    language: options.language,
    includeChanges: options.includeChanges,
  });

  const providerRequest: ProviderRequest = {
    model: options.model,
    systemPrompt,
    userPrompt,
    temperature: options.temperature ?? 0.2,
    maxOutputTokens: options.maxOutputTokens ?? defaultMaxOutputTokens(options.level),
    stream: options.stream ?? false,
    reasoningEffort: options.reasoningEffort,
  };

  const response = await options.provider.generate(providerRequest);
  const responseText = assertNonEmptyResult(response.text);
  const parsed = parseResult(responseText);
  const rewritten = assertNonEmptyResult(parsed.rewritten);
  const fidelity = analyzeFidelity(options.input, rewritten);
  enforceFidelity(options.fidelityMode ?? "balanced", options.level, fidelity);
  const latencyMs = Date.now() - start;

  return {
    original: options.input,
    rewritten,
    profile: options.profile.id,
    level: options.level,
    provider: options.provider.id,
    model: response.model ?? options.model,
    changes: options.includeChanges ? parsed.changes : [],
    warnings: [...parsed.warnings, ...fidelity.warnings],
    usage: response.usage
      ? {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          reasoningTokens: response.usage.reasoningTokens,
          visibleOutputTokens: response.usage.visibleOutputTokens,
          estimatedCost: undefined,
          currency: undefined,
        }
      : undefined,
    latencyMs,
  };
}

interface FidelityAnalysis {
  unsupportedAdditions: string[];
  disproportionateExpansion: boolean;
  warnings: string[];
}

function analyzeFidelity(input: string, rewritten: string): FidelityAnalysis {
  const warnings: string[] = [];
  const additions = detectUnsupportedAdditions(input, rewritten);
  if (additions.length > 0) {
    warnings.push(`Potential unsupported additions: ${additions.join(", ")}`);
  }
  const disproportionateExpansion = isDisproportionateExpansion(input, rewritten);
  if (disproportionateExpansion) {
    warnings.push("Potential disproportionate expansion for a short input.");
  }
  return {
    unsupportedAdditions: additions,
    disproportionateExpansion,
    warnings,
  };
}

function enforceFidelity(mode: FidelityMode, level: RepromptLevel, analysis: FidelityAnalysis): void {
  if (mode === "permissive") {
    return;
  }
  if (mode === "balanced" && level !== "complete" && analysis.disproportionateExpansion) {
    throw new Error("Fidelity error: expansion disproportionnée pour une demande courte.");
  }
  if (mode === "strict" && analysis.unsupportedAdditions.length > 0) {
    throw new Error(`Fidelity error: ajouts non supportés détectés (${analysis.unsupportedAdditions.join(", ")}).`);
  }
}

function defaultMaxOutputTokens(level: RepromptLevel): number {
  switch (level) {
    case "minimal":
      return 250 * 2;
    case "complete":
      return 1100 * 2;
    case "standard":
    default:
      return 450 * 2;
  }
}
