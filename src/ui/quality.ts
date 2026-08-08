import type { QualityAssessment } from "../core/types.js";

export function qualitySignalViewKey(
  signal: QualityAssessment["signals"][number],
  index: number,
): string {
  return `${signal.code}:${String(index)}`;
}
