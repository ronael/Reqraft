import type { RepromptResult } from "../core/types.js";
import type { AppState } from "../ui/app-state.js";
import { describeResultMeta } from "../ui/result-meta.js";
import { formatResultView } from "../ui/result-view.js";
import { resolveStreamedResultPreview } from "./input.js";

export type TuiStatus = "idle" | "loading" | "streaming" | "success" | "error";

export function resultTitle(state: AppState, status: TuiStatus): string {
  if (status === "error" && !state.result) return "Erreur";
  if (status === "loading" || status === "streaming") return "Génération";
  if (state.view === "diff") return "Diff";
  if (state.view === "explain") return "Explication";
  return "Prompt amélioré";
}

export function resultTone(status: TuiStatus): "neutral" | "accent" | "success" | "error" {
  if (status === "error") return "error";
  if (status === "loading" || status === "streaming") return "accent";
  if (status === "success") return "success";
  return "neutral";
}

export function resultMeta(
  result: RepromptResult | null,
  status: TuiStatus,
  startedAt: number,
): string {
  if (status === "loading" || status === "streaming") {
    const elapsed =
      startedAt > 0 ? `${((Date.now() - startedAt) / 1000).toFixed(1)} s` : "en cours";
    return `${elapsed} · réception`;
  }
  return describeResultMeta(result, false);
}

export function resolveVisibleResult({
  state,
  partialText,
  status,
}: {
  state: AppState;
  partialText: string;
  status: TuiStatus;
}): string {
  if ((status === "loading" || status === "streaming") && partialText) {
    return resolveStreamedResultPreview(partialText);
  }
  if (!state.result) return "";
  return formatResultView(state.result, state.view);
}
