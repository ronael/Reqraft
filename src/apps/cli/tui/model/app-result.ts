import type { AppState } from "@/apps/cli/ui/app-state.js";
import type { ResultState } from "@/apps/cli/tui/model/result-state.js";

export type AppStatus = "idle" | "loading" | "streaming" | "success" | "error";

/**
 * Map the application state to the renderable result state.
 *
 * Pure, so it is testable without a renderer. The one rule that matters here is
 * error precedence: a current error must be shown even when `app.result` still
 * holds the output of an earlier successful run — a second run that failed must
 * surface that failure, not quietly fall back to the old success.
 */
export function toResultState(app: AppState, status: AppStatus, partialText: string): ResultState {
  if (status === "error" && app.error) {
    return {
      kind: "error",
      title: app.error.title,
      message: app.error.message,
      nextAction: app.error.nextAction,
    };
  }
  if (status === "loading") return { kind: "loading" };
  if (status === "streaming") return { kind: "streaming", partial: partialText };
  if (app.result) {
    const { result } = app;
    return {
      kind: "success",
      text: result.rewritten,
      quality: result.quality,
      original: result.original,
      changes: result.changes,
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
    };
  }
  return { kind: "empty" };
}
