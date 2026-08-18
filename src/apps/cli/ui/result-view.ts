import type { RepromptResult } from "@/core/types.js";
import { describeQualitySignal, visibleQualitySignals } from "./quality.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";

const DEFAULT_TRANSLATOR = createTranslator("fr");

export type ResultViewMode = "result" | "diff" | "explain";

export function formatResultView(
  result: RepromptResult,
  view: ResultViewMode,
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  switch (view) {
    case "diff":
      return formatDiff(result.original, result.rewritten);
    case "explain":
      return formatExplain(result, t);
    case "result":
      return result.rewritten;
  }
}

export function formatDiff(original: string, rewritten: string): string {
  const originalLines = original.split("\n");
  const rewrittenLines = rewritten.split("\n");
  const output: string[] = [];
  const maxLines = Math.max(originalLines.length, rewrittenLines.length);

  for (let i = 0; i < maxLines; i++) {
    const originalLine = originalLines[i] ?? "";
    const rewrittenLine = rewrittenLines[i] ?? "";
    if (originalLine !== rewrittenLine) {
      output.push(`- ${originalLine}`);
      output.push(`+ ${rewrittenLine}`);
    } else {
      output.push(`  ${originalLine}`);
    }
  }

  return output.join("\n");
}

export function formatExplain(result: RepromptResult, t: Translator = DEFAULT_TRANSLATOR): string {
  const lines = [`${t("explain.changes")} :`];
  for (const change of result.changes) {
    lines.push(`- ${change}`);
  }
  const signals = visibleQualitySignals(result.quality);
  if (signals.length > 0) {
    lines.push("");
    lines.push(`${t("explain.warnings")} :`);
    for (const signal of signals) {
      lines.push(`- ${describeQualitySignal(signal, t)}`);
    }
  }
  return lines.join("\n");
}
