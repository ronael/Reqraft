import type { RepromptResult } from "@/core/types.js";
import type { AppState } from "@/apps/cli/ui/app-state.js";
import { describeResultMeta } from "@/apps/cli/ui/result-meta.js";
import { formatResultView } from "@/apps/cli/ui/result-view.js";
import { resolveStreamedResultPreview } from "./input.js";
import type { Translator } from "@/i18n/translate.js";

export type TuiStatus = "idle" | "loading" | "streaming" | "success" | "error";

export function resultTitle(state: AppState, status: TuiStatus, t: Translator): string {
  if (status === "error" && !state.result) return t("common.error");
  if (status === "loading" || status === "streaming") return t("tui.generation");
  if (state.view === "diff") return "Diff";
  if (state.view === "explain") return t("tui.explanation");
  return t("tui.improvedPrompt");
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
  t: Translator,
): string {
  if (status === "loading" || status === "streaming") {
    const elapsed =
      startedAt > 0 ? `${((Date.now() - startedAt) / 1000).toFixed(1)} s` : t("tui.loading");
    return `${elapsed} · ${t("tui.receiving")}`;
  }
  return describeResultMeta(result, false, t);
}

export function resolveVisibleResult({
  state,
  partialText,
  status,
  t,
}: {
  state: AppState;
  partialText: string;
  status: TuiStatus;
  t: Translator;
}): string {
  if ((status === "loading" || status === "streaming") && partialText) {
    return resolveStreamedResultPreview(partialText);
  }
  if (!state.result) return "";
  return formatResultView(state.result, state.view, t);
}
