import type {
  ProviderAdapter,
  ProviderRequest,
  RepromptLevel,
  RepromptResult,
} from "./types.js";
import type { PromptProfile } from "../profiles/types.js";
import { buildPrompt } from "./prompt-builder.js";
import { parseResult } from "./result-parser.js";

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
    maxOutputTokens: options.maxOutputTokens ?? 1500,
    stream: options.stream ?? false,
  };

  const response = await options.provider.generate(providerRequest);
  const parsed = parseResult(response.text);
  const latencyMs = Date.now() - start;

  return {
    original: options.input,
    rewritten: parsed.rewritten,
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
          estimatedCost: undefined,
          currency: undefined,
        }
      : undefined,
    latencyMs,
  };
}
