import type { RepromptResult } from "../core/types.js";
import { formatDuration } from "./formatters.js";
import type { PanelTone } from "./theme/types.js";

export interface ResultPanelStatus {
  isLoading: boolean;
  hasError: boolean;
  hasResult: boolean;
}

/**
 * Right side of the result panel header: tokens and elapsed time once a run
 * finishes, a plain state word otherwise.
 */
export function describeResultMeta(result: RepromptResult | null, isLoading: boolean): string {
  if (isLoading) {
    return "en cours…";
  }
  if (!result) {
    return "en attente";
  }

  const parts: string[] = [];
  const tokens = result.usage?.visibleOutputTokens;
  if (tokens !== undefined) {
    parts.push(`${String(tokens)} tokens`);
  }
  if (result.latencyMs !== undefined) {
    parts.push(formatDuration(result.latencyMs));
  }
  return parts.join(" · ");
}

/**
 * Panel emphasis follows the run: violet while focused or generating, emerald
 * on success, rose on failure. The mockup tints backgrounds for this; a
 * terminal carries it on the border instead.
 */
export function getResultPanelTone(status: ResultPanelStatus): PanelTone {
  if (status.hasError) {
    return "danger";
  }
  if (status.isLoading) {
    return "primary";
  }
  return status.hasResult ? "success" : "secondary";
}
