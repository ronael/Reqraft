import { REPROMPT_POLICY } from "./reprompt-policy.js";
import { detectInventedCommands, detectInventedPaths } from "./invention.js";
import { isStructurallyInflated } from "./structure.js";
import { detectMissingTechnicalTerms } from "./technical-terms.js";
import { DEFAULT_REPROMPT_LEVEL } from "./levels.js";
import type {
  FidelityMode,
  QualityAssessment,
  QualitySeverity,
  QualitySignal,
  RepromptLevel,
  UnsupportedAddition,
} from "./types.js";

const UNSUPPORTED_ADDITION_TERMS = [
  {
    id: "testimonials",
    patterns: ["témoignage", "témoignages", "testimonial", "testimonials"],
  },
  { id: "faq", patterns: ["faq", "questions fréquentes"] },
  {
    id: "cta",
    patterns: [
      "cta",
      "appel à l'action",
      "call to action",
      "bouton d'action",
      "bouton de conversion",
    ],
  },
  { id: "pricing", patterns: ["pricing", "tarifs", "prix"] },
  { id: "footer", patterns: ["footer", "pied de page"] },
  { id: "header", patterns: ["header", "en-tête", "en tête"] },
  { id: "responsive", patterns: ["responsive", "mobile", "desktop"] },
  { id: "seo", patterns: ["seo", "référencement"] },
  { id: "animations", patterns: ["animation", "animations", "transition", "transitions"] },
  { id: "authentication", patterns: ["authentification", "login", "connexion"] },
  { id: "database", patterns: ["base de données", "database", "bdd"] },
  { id: "color_palette", patterns: ["palette", "couleurs", "blanc", "noir", "gris"] },
  { id: "performance", patterns: ["performance", "performances", "chargement"] },
] as const satisfies readonly { id: UnsupportedAddition; patterns: readonly string[] }[];

export function detectUnsupportedAdditions(input: string, output: string): UnsupportedAddition[] {
  const normalizedInput = normalize(input);
  const normalizedOutput = normalize(output);

  return UNSUPPORTED_ADDITION_TERMS.filter((term) => {
    const inOutput = term.patterns.some((pattern) =>
      containsLexicalTerm(normalizedOutput, pattern),
    );
    const inInput = term.patterns.some((pattern) => containsLexicalTerm(normalizedInput, pattern));
    return inOutput && !inInput;
  }).map((term) => term.id);
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
  level: RepromptLevel = DEFAULT_REPROMPT_LEVEL,
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
      params: { additions },
    });
  }

  if (isDisproportionateExpansion(input, output, level)) {
    signals.push({
      code: "disproportionate_expansion",
      severity: mode === "permissive" ? "info" : "warning",
    });
  }

  signals.push(...assessVerifiableTerms(input, output, mode));

  if (isStructurallyInflated(input, output, level)) {
    signals.push({
      code: "structural_inflation",
      severity: mode === "permissive" ? "info" : "warning",
    });
  }

  return buildQualityAssessment(signals);
}

/** Chemins, commandes et littéraux ont une présence objectivement vérifiable. */
function assessVerifiableTerms(input: string, output: string, mode: FidelityMode): QualitySignal[] {
  const signals: QualitySignal[] = [];
  const severity = mode === "permissive" ? "info" : "warning";
  const paths = detectInventedPaths(input, output);
  if (paths.length > 0) {
    signals.push({
      code: "invented_paths",
      severity,
      params: { paths },
    });
  }

  const commands = detectInventedCommands(input, output);
  if (commands.length > 0) {
    signals.push({
      code: "invented_commands",
      severity,
      params: { commands },
    });
  }

  const missingTechnicalTerms = detectMissingTechnicalTerms(input, output);
  if (missingTechnicalTerms.length > 0) {
    signals.push({
      code: "missing_technical_terms",
      severity,
      params: { terms: missingTechnicalTerms },
    });
  }
  return signals;
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
