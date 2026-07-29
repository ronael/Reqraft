import type { RepromptResult } from "../core/types.js";

export function qualityLabel(status: RepromptResult["quality"]["status"]): string {
  switch (status) {
    case "risky":
      return "risquée";
    case "review":
      return "à vérifier";
    case "good":
    default:
      return "correcte";
  }
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${String(milliseconds)} ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function formatTokenValue(value: number | undefined): string {
  return value === undefined ? "non communiqué" : `${String(value)} tokens`;
}

export function formatTokenMetric(label: string, tokens: number | undefined): string | undefined {
  return tokens === undefined ? undefined : `${String(tokens)} tokens ${label}`;
}

export function formatCost(cost: number, currency?: string): string {
  const suffix = currency ? ` ${currency}` : "";
  return `${cost.toFixed(6)}${suffix}`;
}
