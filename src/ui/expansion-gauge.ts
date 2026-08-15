import { REPROMPT_POLICY } from "../core/reprompt-policy.js";
import { DEFAULT_REPROMPT_LEVEL } from "../core/levels.js";
import type { RepromptLevel } from "../core/types.js";

/**
 * Expansion gauge model (CLI v2, docs/design/cli-v2.md): the fidelity verdict
 * gets a visual — the word-count ratio against the level's policy threshold,
 * with the marker at 80% of the gauge like the landing's fidelity section.
 *
 * Pure module: strings and numbers in, a renderable model out. No ANSI, no
 * surface dependency — the TUI and the desktop can both consume it.
 */

export interface ExpansionGaugeModel {
  /** output/input word ratio, e.g. 1.4. */
  ratio: number;
  /** Policy threshold for the level (multiplier + allowance), e.g. 2.5. */
  threshold: number;
  /** Fill fraction of the gauge, 0..1. */
  fillRatio: number;
  /** Threshold marker position, 0..1 (fixed at 0.8). */
  thresholdPosition: number;
  /** True when the ratio exceeds the threshold. */
  exceeded: boolean;
}

const THRESHOLD_POSITION = 0.8;

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

export function expansionRatio(input: string, output: string): number {
  const inputWords = wordCount(input);
  if (inputWords === 0) {
    return 1;
  }
  return wordCount(output) / inputWords;
}

export function expansionThreshold(
  input: string,
  level: RepromptLevel = DEFAULT_REPROMPT_LEVEL,
): number {
  const policy = REPROMPT_POLICY.fidelity.expansion.levels[level];
  const inputWords = Math.max(1, wordCount(input));
  return policy.inputWordMultiplier + policy.structuralAllowanceWords / inputWords;
}

export function expansionGaugeModel(
  input: string,
  output: string,
  level: RepromptLevel = DEFAULT_REPROMPT_LEVEL,
): ExpansionGaugeModel {
  const ratio = expansionRatio(input, output);
  const threshold = expansionThreshold(input, level);
  const scale = threshold / THRESHOLD_POSITION;
  return {
    ratio,
    threshold,
    fillRatio: Math.min(1, ratio / scale),
    thresholdPosition: THRESHOLD_POSITION,
    exceeded: ratio > threshold,
  };
}

/** One-decimal formatting used by every surface: ×1,4 (French decimal). */
export function formatRatio(value: number): string {
  return `×${value.toFixed(1).replace(".", ",")}`;
}
