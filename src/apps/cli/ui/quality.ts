import type { QualityAssessment, QualitySignal, UnsupportedAddition } from "@/core/types.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";

const ADDITION_KEYS: Record<UnsupportedAddition, `addition.${UnsupportedAddition}`> = {
  testimonials: "addition.testimonials",
  faq: "addition.faq",
  cta: "addition.cta",
  pricing: "addition.pricing",
  footer: "addition.footer",
  header: "addition.header",
  responsive: "addition.responsive",
  seo: "addition.seo",
  animations: "addition.animations",
  authentication: "addition.authentication",
  database: "addition.database",
  color_palette: "addition.color_palette",
  performance: "addition.performance",
};

const DEFAULT_TRANSLATOR = createTranslator("fr");

export function describeQualitySignal(
  signal: QualitySignal,
  t: Translator = DEFAULT_TRANSLATOR,
): string {
  switch (signal.code) {
    case "unsupported_additions":
      return t("quality.unsupportedAdditions", {
        additions: signal.params.additions.map((addition) => t(ADDITION_KEYS[addition])).join(", "),
      });
    case "disproportionate_expansion":
      return t("quality.disproportionateExpansion");
    case "output_truncated":
      return t("quality.outputTruncated");
    case "unstructured_response":
      return t("quality.unstructuredResponse");
    case "model_warning":
      return t("quality.modelWarning", { detail: signal.detail });
    case "profile_detection_fallback":
      return t("quality.profileDetectionFallback");
  }
}

export function visibleQualitySignals(quality: QualityAssessment): QualitySignal[] {
  return quality.signals.filter((signal) => signal.severity !== "info");
}

export function qualitySignalViewKey(
  signal: QualityAssessment["signals"][number],
  index: number,
): string {
  return `${signal.code}:${String(index)}`;
}
