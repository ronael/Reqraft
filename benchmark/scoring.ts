import type { BenchmarkCase } from "./cases/dataset.js";
import { detectInventedCommands, detectInventedPaths } from "@/core/invention.js";
import { extractTechnicalTerms } from "@/core/technical-terms.js";

/**
 * Ce qu'on mesure sur une reformulation, localement.
 *
 * Chaque critère est calculable sans réseau ni juge : c'est ce qui rend la
 * mesure reproductible et compatible avec un produit local-first. Aucun critère
 * n'est une constante — deux d'entre eux l'étaient, `intention` et `profile`
 * valaient 1 quoi qu'il arrive, ce qui remontait mécaniquement chaque total de
 * 0,4 et rendait deux modèles indiscernables sur près de la moitié du score.
 */

/**
 * La version du score, écrite dans chaque exécution.
 *
 * Comparer deux exécutions calculées par des règles différentes donnerait un
 * écart qui ne mesure que le changement de règles. `compare` refuse de le
 * faire ; ce numéro est ce qui le lui permet.
 */
export const SCORE_VERSION = 3;

export interface BenchmarkScore {
  /** Termes de la demande retrouvés dans la sortie. */
  terms: number;
  /** Mots porteurs de sens de la demande, conservés dans la sortie. */
  intention: number;
  /** Rien d'ajouté : ni terme interdit, ni chemin, ni commande. */
  noInvention: number;
  /** Une sortie non vide, et qui n'explose pas la longueur de la demande. */
  clarity: number;
  total: number;
}

/** Mots trop fréquents pour dire quoi que ce soit de l'intention. */
const STOP_WORDS = new Set([
  "a",
  "ai",
  "au",
  "aux",
  "avec",
  "ce",
  "ces",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "en",
  "est",
  "et",
  "eux",
  "il",
  "je",
  "la",
  "le",
  "les",
  "leur",
  "lui",
  "ma",
  "mais",
  "me",
  "mes",
  "moi",
  "mon",
  "ne",
  "nos",
  "notre",
  "nous",
  "on",
  "ou",
  "par",
  "pas",
  "pour",
  "qu",
  "que",
  "qui",
  "sa",
  "se",
  "ses",
  "son",
  "sur",
  "ta",
  "te",
  "tes",
  "toi",
  "ton",
  "tu",
  "un",
  "une",
  "vos",
  "votre",
  "vous",
  "and",
  "for",
  "from",
  "into",
  "of",
  "on",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Combien de l'intention initiale survit à la reformulation.
 *
 * Une approximation assumée : la proportion des mots porteurs de sens de la
 * demande qu'on retrouve dans la sortie. Elle ne prouve pas que le sens est
 * intact, mais elle chute quand une reformulation part ailleurs — ce qu'un `1`
 * constant ne faisait jamais.
 */
function scoreIntention(input: string, output: string): number {
  const wanted = new Set(contentWords(input));
  if (wanted.size === 0) return 1;

  const present = new Set(contentWords(output));
  let kept = 0;
  for (const word of wanted) {
    if (present.has(word)) kept += 1;
  }
  return kept / wanted.size;
}

function uniqueTerms(terms: readonly string[]): string[] {
  const byCanonicalForm = new Map<string, string>();
  for (const term of terms) byCanonicalForm.set(term.toLocaleLowerCase("en-US"), term);
  return [...byCanonicalForm.values()];
}

export function scoreCase(output: string, originalCase: BenchmarkCase): BenchmarkScore {
  const lowerOutput = output.toLowerCase();

  const termsToPreserve = uniqueTerms([
    ...originalCase.requiredTerms,
    ...extractTechnicalTerms(originalCase.input),
  ]);
  const requiredTermsFound = termsToPreserve.filter((term) =>
    lowerOutput.includes(term.toLowerCase()),
  ).length;
  const terms = termsToPreserve.length === 0 ? 1 : requiredTermsFound / termsToPreserve.length;

  // Les mêmes détecteurs que le produit : ce que le benchmark mesure est ce
  // que l'utilisateur verra signalé, pas une seconde définition de l'invention.
  const forbidden = (originalCase.forbiddenAdditions ?? []).filter((term) =>
    lowerOutput.includes(term.toLowerCase()),
  );
  const invented = [
    ...forbidden,
    ...detectInventedPaths(originalCase.input, output),
    ...detectInventedCommands(originalCase.input, output),
  ];
  const noInvention = invented.length === 0 ? 1 : 0;

  const intention = scoreIntention(originalCase.input, output);
  const clarity = output.length > 0 && output.length < originalCase.input.length * 3 ? 1 : 0.5;

  return {
    terms,
    intention,
    noInvention,
    clarity,
    total: (terms + intention + noInvention + clarity) / 4,
  };
}

export interface ProfileBreakdown {
  profile: string;
  cases: number;
  meanTotal: number;
  meanTerms: number;
  meanIntention: number;
  meanNoInvention: number;
  meanClarity: number;
}

/**
 * Le score, décomposé par profil.
 *
 * Une moyenne unique cachait précisément ce qu'on veut savoir : un modèle peut
 * exceller sur `writing` et s'effondrer sur `code`, et les deux se compensent
 * dans un seul nombre. Comparer deux modèles demande de comparer profil par
 * profil.
 */
export function summarizeByProfile(
  results: readonly { profile: string; score: BenchmarkScore }[],
): ProfileBreakdown[] {
  const byProfile = new Map<string, BenchmarkScore[]>();
  for (const result of results) {
    byProfile.set(result.profile, [...(byProfile.get(result.profile) ?? []), result.score]);
  }

  const mean = (scores: BenchmarkScore[], pick: (score: BenchmarkScore) => number): number =>
    scores.reduce((sum, score) => sum + pick(score), 0) / scores.length;

  return [...byProfile.entries()]
    .map(([profile, scores]) => ({
      profile,
      cases: scores.length,
      meanTotal: mean(scores, (score) => score.total),
      meanTerms: mean(scores, (score) => score.terms),
      meanIntention: mean(scores, (score) => score.intention),
      meanNoInvention: mean(scores, (score) => score.noInvention),
      meanClarity: mean(scores, (score) => score.clarity),
    }))
    .sort((a, b) => a.profile.localeCompare(b.profile));
}
