const UNSUPPORTED_ADDITION_TERMS = [
  { label: "témoignages", patterns: ["témoignage", "témoignages", "testimonial", "testimonials"] },
  { label: "FAQ", patterns: ["faq", "questions fréquentes"] },
  { label: "CTA", patterns: ["cta", "appel à l'action", "call to action"] },
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
    const inOutput = term.patterns.some((pattern) => normalizedOutput.includes(normalize(pattern)));
    const inInput = term.patterns.some((pattern) => normalizedInput.includes(normalize(pattern)));
    return inOutput && !inInput;
  }).map((term) => term.label);
}

export function isDisproportionateExpansion(input: string, output: string): boolean {
  const inputWords = wordCount(input);
  const outputWords = wordCount(output);
  if (inputWords < 30) {
    return outputWords > 80 || outputWords > inputWords * 5;
  }
  if (inputWords < 90) {
    return outputWords > inputWords * 5;
  }
  return false;
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
