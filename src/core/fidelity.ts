import { REPROMPT_POLICY } from "./reprompt-policy.js";
import type {
  FidelityMode,
  QualityAssessment,
  QualitySeverity,
  QualitySignal,
  RepromptLevel,
} from "./types.js";

const UNSUPPORTED_ADDITION_TERMS = [
  { label: "témoignages", patterns: ["témoignage", "témoignages", "testimonial", "testimonials"] },
  { label: "FAQ", patterns: ["faq", "questions fréquentes"] },
  {
    label: "CTA",
    patterns: [
      "cta",
      "appel à l'action",
      "call to action",
      "bouton d'action",
      "bouton de conversion",
    ],
  },
  { label: "pricing", patterns: ["pricing", "tarifs", "prix"] },
  { label: "footer", patterns: ["footer", "pied de page"] },
  { label: "header", patterns: ["header", "en-tête", "en tête"] },
  { label: "responsive", patterns: ["responsive", "mobile", "desktop"] },
  { label: "SEO", patterns: ["seo", "référencement"] },
  { label: "animations", patterns: ["animation", "animations", "transition", "transitions"] },
  { label: "authentification", patterns: ["authentification", "login", "connexion"] },
  { label: "base de données", patterns: ["base de données", "database", "bdd"] },
  { label: "palette détaillée", patterns: ["palette", "couleurs", "blanc", "noir", "gris"] },
  { label: "performance", patterns: ["performance", "performances", "chargement"] },
] as const;

export function detectUnsupportedAdditions(input: string, output: string): string[] {
  const normalizedInput = normalize(input);
  const normalizedOutput = normalize(output);

  return UNSUPPORTED_ADDITION_TERMS.filter((term) => {
    const inOutput = term.patterns.some((pattern) =>
      containsLexicalTerm(normalizedOutput, pattern),
    );
    const inInput = term.patterns.some((pattern) => containsLexicalTerm(normalizedInput, pattern));
    return inOutput && !inInput;
  }).map((term) => term.label);
}

function containsLexicalTerm(text: string, pattern: string): boolean {
  const normalizedPattern = normalize(pattern);
  const escapedPattern = normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapedPattern}(?=$|[^\\p{L}\\p{N}])`, "u");
  return expression.test(text);
}

export function isDisproportionateExpansion(
  input: string,
  output: string,
  level: RepromptLevel = "standard",
): boolean {
  const inputWords = wordCount(input);
  const outputWords = wordCount(output);
  const policy = REPROMPT_POLICY.fidelity.expansion.levels[level];
  const expectedMaximum = inputWords * policy.inputWordMultiplier + policy.structuralAllowanceWords;
  return outputWords > expectedMaximum;
}

export function assessFidelity(
  input: string,
  output: string,
  mode: FidelityMode,
  level: RepromptLevel,
): QualityAssessment {
  const signals: QualitySignal[] = [];
  const additions = detectUnsupportedAdditions(input, output);

  if (additions.length > 0) {
    signals.push({
      code: "unsupported_additions",
      severity: mode === "strict" ? "warning" : "info",
      message: `Éléments potentiellement ajoutés sans demande explicite : ${additions.join(", ")}.`,
      details: additions,
    });
  }

  if (isDisproportionateExpansion(input, output, level)) {
    signals.push({
      code: "disproportionate_expansion",
      severity: mode === "permissive" ? "info" : "warning",
      message: "La reformulation est nettement plus développée que la demande d’origine.",
    });
  }

  return buildQualityAssessment(signals);
}

export function buildQualityAssessment(signals: QualitySignal[]): QualityAssessment {
  return {
    status: resolveQualityStatus(signals.map((signal) => signal.severity)),
    signals,
  };
}

function resolveQualityStatus(severities: QualitySeverity[]): QualityAssessment["status"] {
  if (severities.includes("critical")) return "risky";
  if (severities.includes("warning")) return "review";
  return "good";
}

function wordCount(text: string): number {
  return normalize(text).split(/\s+/).filter(Boolean).length;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "'");
}
