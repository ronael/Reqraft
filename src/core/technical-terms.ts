import { detectInventedCommands, detectInventedPaths } from "./invention.js";

/**
 * Littéraux techniques qu'une reformulation doit recopier, pas interpréter.
 *
 * La sélection reste volontairement étroite : chaque forme est syntaxique et
 * vérifiable localement. Les noms métier ordinaires ne sont pas inclus, car
 * décider qu'un synonyme les a préservés demanderait un juge sémantique.
 */

const TECHNICAL_PATTERNS = [/\bhttps?:\/\/[^\s<>"'`]+/giu, /--\p{L}[\p{L}\p{N}-]*/gu] as const;

const HTTP_ENDPOINT = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[\w./:@%+~-]+)/giu;
const INLINE_CODE = /`([^`\n]{1,120})`/g;
const TOKEN = /[\p{L}\p{N}_][\p{L}\p{N}_.-]*/gu;
const TRAILING_PUNCTUATION = new Set(["!", ")", ",", ".", ";", ":", "?", "]", "}"]);

function canonical(term: string): string {
  return term.normalize("NFKC").toLocaleLowerCase("en-US");
}

function trimTerm(value: string): string {
  const trimmed = value.trim();
  let end = trimmed.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(trimmed[end - 1] ?? "")) end -= 1;
  return trimmed.slice(0, end);
}

function add(found: Map<string, string>, value: string): void {
  const term = trimTerm(value);
  if (term !== "") found.set(canonical(term), term);
}

function isVersion(token: string): boolean {
  const candidate = token.toLowerCase().startsWith("v") ? token.slice(1) : token;
  const [core, suffix, ...extra] = candidate.split("-");
  if (extra.length > 0 || core === undefined) return false;
  const numbers = core.split(".");
  if (numbers.length < 2 || numbers.some((part) => part === "" || !/^\d+$/.test(part))) {
    return false;
  }
  return suffix === undefined || (suffix !== "" && /^[0-9A-Za-z.]+$/.test(suffix));
}

function isIdentifier(token: string): boolean {
  if (token.includes("_")) {
    const parts = token.split("_");
    return (
      parts.length > 1 && parts.every((part) => part !== "" && /^\p{L}[\p{L}\p{N}]*$/u.test(part))
    );
  }

  let sawLower = false;
  let index = 0;
  for (const character of token) {
    if (/\p{Ll}/u.test(character)) sawLower = true;
    if (index > 0 && sawLower && /\p{Lu}/u.test(character)) return true;
    index += 1;
  }
  return false;
}

function addPatternMatches(found: Map<string, string>, text: string): void {
  for (const pattern of TECHNICAL_PATTERNS) {
    for (const match of text.matchAll(pattern)) add(found, match[0]);
  }
}

function addTokenMatches(found: Map<string, string>, text: string): void {
  for (const match of text.matchAll(TOKEN)) {
    const token = trimTerm(match[0]);
    if (isIdentifier(token) || isVersion(token)) add(found, token);
  }
}

function addHttpMatches(found: Map<string, string>, text: string): void {
  for (const match of text.matchAll(HTTP_ENDPOINT)) {
    if (match[1] !== undefined) add(found, match[1]);
    if (match[2] !== undefined) add(found, match[2]);
  }
}

function addInlineCode(found: Map<string, string>, text: string): void {
  for (const match of text.matchAll(INLINE_CODE)) {
    if (match[1] !== undefined) add(found, match[1]);
  }
}

function removeContainedTerms(terms: string[]): string[] {
  const specificFirst = [...terms];
  specificFirst.sort((a, b) => b.length - a.length);
  return specificFirst.filter(
    (term, index) =>
      !specificFirst.some((candidate, candidateIndex) => {
        return candidateIndex < index && containsTerm(candidate, term);
      }),
  );
}

/** Extrait uniquement des formes dont la conservation peut être vérifiée. */
export function extractTechnicalTerms(text: string): string[] {
  const found = new Map<string, string>();

  const knownSyntax = [...detectInventedPaths("", text), ...detectInventedCommands("", text)];
  for (const value of knownSyntax) {
    add(found, value);
  }
  addPatternMatches(found, text);
  addTokenMatches(found, text);
  addHttpMatches(found, text);
  addInlineCode(found, text);

  const terms = removeContainedTerms([...found.values()]);
  terms.sort((a, b) => a.localeCompare(b));
  return terms;
}

function containsTerm(text: string, term: string): boolean {
  const escaped = canonical(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "u").test(
    canonical(text),
  );
}

/** Termes techniques fournis dans la demande puis absents de la sortie. */
export function detectMissingTechnicalTerms(input: string, output: string): string[] {
  return extractTechnicalTerms(input).filter((term) => !containsTerm(output, term));
}
