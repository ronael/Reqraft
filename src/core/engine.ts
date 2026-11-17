import type { PromptProfile } from "@/profiles/types.js";
import { resolveModelCapabilities } from "@/models/capabilities.js";
import { RequestCancelledError, RequestTimeoutError } from "./errors.js";
import { assessFidelity, buildQualityAssessment } from "./fidelity.js";
import {
  buildAutoDetectPrompt,
  buildCompactPrompt,
  buildPrompt,
  type BuiltPrompt,
  type PromptVariant,
} from "./prompt-builder.js";
import { REPROMPT_POLICY, resolveOutputTokenBudget } from "./reprompt-policy.js";
import { startResponseDeadline } from "./response-deadline.js";
import { parseResult, resolveDetectedProfileId, resultJsonSchema } from "./result-parser.js";
import { DEFAULT_FIDELITY_MODE } from "./types.js";
import type {
  ProviderAdapter,
  FidelityMode,
  ProviderRequest,
  QualitySignal,
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
  /**
   * How long the provider may stay silent: before its first token, then
   * between two pieces of its answer (`core/response-deadline.ts`).
   */
  timeoutMs?: number;
  /**
   * Which system prompt to send. Defaults to `compact` for a provider on the
   * user's own hardware (`ProviderAdapter.local`), `full` otherwise; the
   * benchmark sets it to compare both on the same model.
   */
  promptVariant?: PromptVariant;
  /** Caller-owned cancellation, combined with the timeout. */
  signal?: AbortSignal;
  /** Receives text as it arrives when streaming is enabled. */
  onDelta?: (chunk: string) => void;
}

/**
 * The profile id a result reports, and — for `"auto"` only — the signal that
 * makes a silent fallback observable instead of indistinguishable from a
 * confident "clean" choice by the model.
 *
 * Severity `info`, deliberately: this is not a sign that the rewrite itself
 * is unreliable, only that the profile guess defaulted. `info`-severity
 * signals are excluded from `visibleQualitySignals` (`ui/quality.ts`) and
 * from `resolveQualityStatus` (`core/fidelity.ts`), so this never turns an
 * otherwise-fine `status: "good"` result into a "needs review" one, or adds
 * warning-banner noise to every default `auto` run under a provider that
 * simply never fills in `profile` (the `mock` provider, always). It is still
 * fully present in `result.quality.signals` for anyone who checks — the
 * benchmark in `benchmark/auto-profile-runner.ts` does.
 */
function resolveResultProfile(
  requestedProfile: PromptProfile | "auto",
  parsedProfile: string | undefined,
): { profileId: string; fallbackSignal: QualitySignal | null } {
  if (requestedProfile !== "auto") {
    return { profileId: requestedProfile.id, fallbackSignal: null };
  }
  const detection = resolveDetectedProfileId(parsedProfile);
  return {
    profileId: detection.profileId,
    fallbackSignal: detection.fellBack
      ? { code: "profile_detection_fallback", severity: "info" }
      : null,
  };
}

function buildRequestPrompt(options: EngineOptions): BuiltPrompt {
  const variant = options.promptVariant ?? (options.provider.local ? "compact" : "full");
  if (variant === "compact") {
    return buildCompactPrompt(options);
  }
  return options.profile === "auto"
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
}

export async function rewrite(options: EngineOptions): Promise<RepromptResult> {
  const start = Date.now();

  const { systemPrompt, userPrompt } = buildRequestPrompt(options);

  const timeoutMs = options.timeoutMs ?? REPROMPT_POLICY.runtime.defaultTimeoutMs;
  const deadline = startResponseDeadline({ firstTokenMs: timeoutMs, idleMs: timeoutMs });
  const signal = options.signal
    ? AbortSignal.any([deadline.signal, options.signal])
    : deadline.signal;
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
      // A local thinking model may reason whatever it is asked: room is kept
      // for it, or the reasoning alone would exhaust the answer's budget.
      mayReason: options.provider.local === true,
      requestedMaxOutputTokens: options.maxOutputTokens,
      modelMaxOutputTokens: modelCapabilities.maxOutputTokens,
    }),
    stream: options.stream ?? false,
    reasoningEffort: options.reasoningEffort,
    signal,
    onDelta: (chunk) => {
      deadline.touch();
      options.onDelta?.(chunk);
    },
    onActivity: () => {
      deadline.touch();
    },
    responseSchema: resultJsonSchema({
      profile: options.profile === "auto",
      changes: options.includeChanges,
    }),
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
    if (deadline.expired !== undefined) {
      throw new RequestTimeoutError(timeoutMs, deadline.expired);
    }
    throw error;
  } finally {
    deadline.dispose();
  }
  const responseText = assertNonEmptyResult(response.text);
  const parsed = parseResult(responseText);
  const rewritten = assertNonEmptyResult(parsed.rewritten);
  const { profileId, fallbackSignal } = resolveResultProfile(options.profile, parsed.profile);

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
    ...(fallbackSignal ? [fallbackSignal] : []),
  ]);
  const latencyMs = Date.now() - start;

  return {
    original: options.input,
    rewritten,
    profile: profileId,
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
