import type { RepromptResult } from "@/core/types.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";

const DEFAULT_TRANSLATOR = createTranslator("fr");

export function qualityLabel(
  status: RepromptResult["quality"]["status"],
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  switch (status) {
    case "risky":
      return t("quality.statusRisky");
    case "review":
      return t("quality.statusReview");
    case "good":
    default:
      return t("quality.statusGood");
  }
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${String(milliseconds)} ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function formatTokenValue(
  value: number | undefined,
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  return value === undefined ? t("stats.notReported") : t("stats.tokens", { value });
}

export function formatTokenMetric(label: string, tokens: number | undefined): string | undefined {
  return tokens === undefined ? undefined : `${String(tokens)} tokens ${label}`;
}

export function formatCost(cost: number, currency?: string): string {
  const suffix = currency ? ` ${currency}` : "";
  return `${cost.toFixed(6)}${suffix}`;
}
