import type { PromptProfile } from "../profiles/types.js";
import { resolveModelCapabilities } from "../models/capabilities.js";
import { RequestCancelledError, RequestTimeoutError } from "./errors.js";
import { assessFidelity, buildQualityAssessment } from "./fidelity.js";
import { buildAutoDetectPrompt, buildPrompt } from "./prompt-builder.js";
import { REPROMPT_POLICY, resolveOutputTokenBudget } from "./reprompt-policy.js";
import { parseResult, resolveDetectedProfileId } from "./result-parser.js";
import { DEFAULT_FIDELITY_MODE } from "./types.js";
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
  /**
   * `"auto"` defers the profile choice to the model itself: the same call
   * that produces the rewrite also reports which profile it applied (see
   * `buildAutoDetectPrompt`). No separate classification round-trip.
   */
  profile: PromptProfile | "auto";
  level: RepromptLevel;
  provider: ProviderAdapter;
  model: string;
  outputLanguage?: string;
  includeChanges: boolean;
  stream?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  fidelityMode?: FidelityMode;
  timeoutMs?: number;
  /** Caller-owned cancellation, combined with the timeout. */
  signal?: AbortSignal;
  /** Receives text as it arrives when streaming is enabled. */
  onDelta?: (chunk: string) => void;
}

export async function rewrite(options: EngineOptions): Promise<RepromptResult> {
  const start = Date.now();

  const { systemPrompt, userPrompt } =
    options.profile === "auto"
      ? buildAutoDetectPrompt({
          input: options.input,
          level: options.level,
          outputLanguage: options.outputLanguage,
          includeChanges: options.includeChanges,
        })
      : buildPrompt({
          input: options.input,
          profile: options.profile,
          level: options.level,
          outputLanguage: options.outputLanguage,
          includeChanges: options.includeChanges,
        });

  const timeoutMs = options.timeoutMs ?? REPROMPT_POLICY.runtime.defaultTimeoutMs;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeoutSignal, options.signal]) : timeoutSignal;
  const modelCapabilities = resolveModelCapabilities(options.provider.id, options.model);
  const providerRequest: ProviderRequest = {
    model: options.model,
    systemPrompt,
    userPrompt,
    temperature: options.temperature ?? REPROMPT_POLICY.generation.defaultTemperature,
    maxOutputTokens: resolveOutputTokenBudget({
      input: options.input,
      level: options.level,
      reasoningEffort: options.reasoningEffort,
      requestedMaxOutputTokens: options.maxOutputTokens,
      modelMaxOutputTokens: modelCapabilities.maxOutputTokens,
    }),
    stream: options.stream ?? false,
    reasoningEffort: options.reasoningEffort,
    signal,
    onDelta: options.onDelta,
  };

  let response: Awaited<ReturnType<ProviderAdapter["generate"]>>;
  try {
    response = await options.provider.generate(providerRequest);
  } catch (error) {
    // The caller's cancellation takes precedence: an interrupted run is not a
    // failure, and must not be reported as one.
    if (options.signal?.aborted) {
      throw new RequestCancelledError();
    }
    if (timeoutSignal.aborted) {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw error;
  }
  const responseText = assertNonEmptyResult(response.text);
  const parsed = parseResult(responseText);
  const rewritten = assertNonEmptyResult(parsed.rewritten);
  const fidelity = assessFidelity(
    options.input,
    rewritten,
    options.fidelityMode ?? DEFAULT_FIDELITY_MODE,
    options.level,
  );
  const completionSignals =
    response.finishReason === "length" || response.finishReason === "max_tokens"
      ? [
          {
            code: "output_truncated" as const,
            severity: "critical" as const,
          },
        ]
      : [];
  const modelSignals = parsed.modelWarnings.map((warning) => ({
    code: "model_warning" as const,
    severity: "warning" as const,
    detail: warning,
  }));
  const formatSignals =
    parsed.format === "raw"
      ? [
          {
            code: "unstructured_response" as const,
            severity: "warning" as const,
          },
        ]
      : [];
  const quality = buildQualityAssessment([
    ...fidelity.signals,
    ...completionSignals,
    ...modelSignals,
    ...formatSignals,
  ]);
  const latencyMs = Date.now() - start;

  return {
    original: options.input,
    rewritten,
    profile:
      options.profile === "auto" ? resolveDetectedProfileId(parsed.profile) : options.profile.id,
    level: options.level,
    provider: options.provider.id,
    model: response.model ?? options.model,
    changes: options.includeChanges ? parsed.changes : [],
    quality,
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
