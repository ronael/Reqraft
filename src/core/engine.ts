import type {
  ProviderAdapter,
  ProviderRequest,
  RepromptLevel,
  RepromptResult,
} from "./types.js";
import type { PromptProfile } from "../profiles/types.js";
import { buildPrompt } from "./prompt-builder.js";
import { parseResult } from "./result-parser.js";
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
  const latencyMs = Date.now() - start;

  return {
    original: options.input,
    rewritten,
    profile: options.profile.id,
    level: options.level,
    provider: options.provider.id,
    model: response.model ?? options.model,
    changes: options.includeChanges ? parsed.changes : [],
    warnings: parsed.warnings,
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

function defaultMaxOutputTokens(level: RepromptLevel): number {
  switch (level) {
    case "minimal":
      return 250;
    case "complete":
      return 1100;
    case "standard":
    default:
      return 450;
  }
}
