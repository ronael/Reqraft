import type { QualityAssessment } from "@/core/types.js";

/**
 * What the result panel is showing.
 *
 * A discriminated union rather than a handful of independent booleans: with
 * `isLoading`, `hasError`, `isStreaming` and `hasResult` as separate flags,
 * four of the sixteen combinations are meaningful and the other twelve are
 * bugs waiting to render. Here the impossible states cannot be constructed.
 */
export type ResultState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "streaming"; partial: string }
  | { kind: "success"; text: string; quality?: QualityAssessment }
  | { kind: "error"; title: string; message: string };

export function isBusy(state: ResultState): boolean {
  return state.kind === "loading" || state.kind === "streaming";
}

/** Text worth keeping when a run is interrupted, if any arrived. */
export function partialText(state: ResultState): string | null {
  if (state.kind === "streaming" && state.partial.length > 0) return state.partial;
  if (state.kind === "success") return state.text;
  return null;
}

export function hasResult(state: ResultState): boolean {
  return state.kind === "success";
}
