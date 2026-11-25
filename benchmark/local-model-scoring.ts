import { isDisproportionateExpansion } from "@/core/fidelity.js";
import { hasRewriteInstructionWrapper } from "@/core/rewrite-instruction.js";
import { isStructurallyInflated } from "@/core/structure.js";
import type { LocalModelCase } from "./local-model-cases.js";

/**
 * How a local model's rewrite is scored, without a network or a judge.
 *
 * Five dimensions, each between 0 and 1, from the questions that decide
 * whether a model can be recommended:
 *
 * - `meaning`: the request is still there — its key terms found, and no order
 *   inside it obeyed, no question answered;
 * - `language`: written in the input's language;
 * - `level`: the level's bounds held — no expansion or structure beyond what
 *   it allows, a clean text left almost as it was, nothing added the case
 *   forbids;
 * - `facts`: names, numbers, code and paths exactly as given;
 * - `chatter`: no preamble, no closing remark, no leaked JSON, no "rewrite my
 *   request" wrapper.
 *
 * Pure: no provider, no filesystem, so `pnpm test` exercises it with
 * fabricated outputs (`tests/unit/local-model-scoring.test.ts`).
 */

/** Compare scores only within one version: a rule change moves every total. */
export const LOCAL_MODEL_SCORE_VERSION = 1;

export interface LocalModelScore {
  meaning: number;
  language: number;
  level: number;
  facts: number;
  chatter: number;
  /** Mean of the five, 0 for an empty output. */
  total: number;
  /** What failed, in words, for the report. */
  notes: string[];
}

/** Lower case, accents removed: "Équipe" and "equipe" are one word. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A meaning term found at the start of a word, accents and case ignored. The
 * end is left open so a stem matches its forms: "expir" finds "expiration".
 */
function hasTerm(text: string, term: string): boolean {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(fold(term))}`, "u");
  return pattern.test(fold(text));
}

const NUMBER = /^\d+(?:[.,]\d+)?$/;

/**
 * A fact found exactly. A number must not be part of a larger one — "3" is
 * not kept by "30" — but may be glued to a unit, as in "14h".
 */
export function hasFact(text: string, fact: string): boolean {
  if (NUMBER.test(fact)) {
    return new RegExp(`(?<![\\d.,])${escapeRegExp(fact)}(?!\\d|[.,]\\d)`).test(text);
  }
  return text.replace(/\s+/g, " ").includes(fact.replace(/\s+/g, " "));
}

const FRENCH_MARKERS = new Set([
  "le",
  "la",
  "les",
  "des",
  "du",
  "de",
  "et",
  "est",
  "pour",
  "dans",
  "une",
  "un",
  "que",
  "qui",
  "sur",
  "avec",
  "pas",
  "au",
  "aux",
  "ce",
  "cette",
  "il",
  "elle",
  "nous",
  "vous",
  "sont",
  "en",
  "ne",
  "se",
  "sa",
  "son",
  "ses",
  "leur",
  "doit",
  "faut",
  "quand",
  "sans",
  "puis",
  "afin",
]);
const ENGLISH_MARKERS = new Set([
  "the",
  "and",
  "for",
  "with",
  "to",
  "of",
  "in",
  "is",
  "are",
  "it",
  "this",
  "that",
  "be",
  "should",
  "must",
  "when",
  "from",
  "by",
  "as",
  "an",
  "or",
  "not",
  "all",
  "every",
  "only",
  "its",
  "their",
  "without",
  "then",
  "into",
  "make",
  "sure",
]);

/**
 * The language a text is written in, from its function words; undefined when
 * there are too few to tell — a fragment such as "flaky e2e" says nothing.
 */
export function detectLanguage(text: string): "fr" | "en" | undefined {
  let french = 0;
  let english = 0;
  for (const word of fold(text).split(/[^\p{L}']+/u)) {
    if (FRENCH_MARKERS.has(word)) french += 1;
    if (ENGLISH_MARKERS.has(word)) english += 1;
  }
  if (french + english < 2 || french === english) return undefined;
  return french > english ? "fr" : "en";
}

/** 1 for identical texts, 0 for nothing in common; on characters, after folding. */
export function similarity(a: string, b: string): number {
  const left = fold(a).replace(/\s+/g, " ").trim();
  const right = fold(b).replace(/\s+/g, " ").trim();
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (left[i - 1] === right[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return 1 - (previous[right.length] ?? longest) / longest;
}

/** A clean text at the minimal level comes back at least this close to itself. */
const CLEAN_SIMILARITY = 0.85;

/** How a reply starts when it talks to the user instead of being the rewrite. */
const PREAMBLES = [
  "voici",
  "voila",
  "here's",
  "here is",
  "sure",
  "certainly",
  "of course",
  "bien sur",
  "absolument",
  "reformulation",
  "texte reformul",
  "version reformul",
  "prompt reformul",
  "rewritten",
  "rewrite:",
  "okay,",
  "ok,",
];
/** Quotes and Markdown marks a preamble may hide behind. */
const LEADING_MARKS = new Set([" ", "\n", "\t", '"', "'", "«", "“", "*", "_", "#", ">"]);

function startsWithPreamble(output: string): boolean {
  const folded = fold(output);
  let start = 0;
  while (start < folded.length && LEADING_MARKS.has(folded.charAt(start))) start += 1;
  const opening = folded.slice(start);
  return PREAMBLES.some((preamble) => opening.startsWith(preamble));
}

const CLOSING =
  /j['’]esp[eè]re que|n['’]h[eé]site pas|hope this helps|let me know|feel free|as an ai\b|en tant qu['’]ia/i;
/** The JSON envelope, leaked into the text the user would copy. */
const LEAKED_ENVELOPE = /"rewritten"\s*:|^\s*\{\s*"/;

function chatterNotes(input: string, output: string): string[] {
  const notes: string[] = [];
  if (startsWithPreamble(output)) notes.push("preamble");
  if (CLOSING.test(output)) notes.push("closing remark");
  if (LEAKED_ENVELOPE.test(output)) notes.push("JSON envelope leaked");
  if (hasRewriteInstructionWrapper(input, output)) notes.push("rewrite-instruction wrapper");
  return notes;
}

const SURROUNDING = new Set([" ", "\n", "\t", '"', "'", "«", "»", "“", "”", ".", "!", " "]);

/**
 * Quotes, spaces, final punctuation and case removed: « D'accord. » is
 * "d'accord". A loop rather than an anchored `[…]+$`, which backtracks.
 */
function bare(text: string): string {
  const folded = fold(text).replace(/[’`]/g, "'");
  let start = 0;
  let end = folded.length;
  while (start < end && SURROUNDING.has(folded.charAt(start))) start += 1;
  while (end > start && SURROUNDING.has(folded.charAt(end - 1))) end -= 1;
  return folded.slice(start, end);
}

function share(found: number, total: number): number {
  return total === 0 ? 1 : found / total;
}

interface Dimension {
  score: number;
  notes: string[];
}

/** The key terms found, unless the model did the task instead of rewriting it. */
function meaningOf(benchmarkCase: LocalModelCase, output: string, didTheTask: boolean): Dimension {
  const missing = benchmarkCase.meaning.filter(
    (group) => !group.some((term) => hasTerm(output, term)),
  );
  const notes =
    missing.length === 0
      ? []
      : [`meaning lost: ${missing.map((group) => group[0] ?? "").join(", ")}`];
  const found = benchmarkCase.meaning.length - missing.length;
  return { score: didTheTask ? 0 : share(found, benchmarkCase.meaning.length), notes };
}

function languageOf(benchmarkCase: LocalModelCase, output: string): Dimension {
  const written = detectLanguage(output);
  return written === undefined || written === benchmarkCase.language
    ? { score: 1, notes: [] }
    : { score: 0, notes: [`written in ${written}`] };
}

/**
 * The level's bounds: expansion, structure, a clean text left alone at the
 * minimal level, and nothing added that the case forbids.
 */
function levelOf(benchmarkCase: LocalModelCase, output: string, oversteps: boolean): Dimension {
  const { input, level } = benchmarkCase;
  const checks: [boolean, string][] = [
    [!isDisproportionateExpansion(input, output, level), "expanded beyond the level"],
    [!isStructurallyInflated(input, output, level), "structure beyond the level"],
  ];
  if (benchmarkCase.clean === true && level === "minimal") {
    checks.push([similarity(input, output) >= CLEAN_SIMILARITY, "clean text rewritten"]);
  }
  if (oversteps) checks.push([false, "added what the case forbids"]);
  return {
    score: share(checks.filter(([passed]) => passed).length, checks.length),
    notes: checks.filter(([passed]) => !passed).map(([, note]) => note),
  };
}

function factsOf(benchmarkCase: LocalModelCase, output: string): Dimension {
  const facts = benchmarkCase.facts ?? [];
  const missing = facts.filter((fact) => !hasFact(output, fact));
  return {
    score: share(facts.length - missing.length, facts.length),
    notes: missing.length === 0 ? [] : [`facts lost: ${missing.join(", ")}`],
  };
}

export function scoreLocalModelCase(
  benchmarkCase: LocalModelCase,
  output: string,
): LocalModelScore {
  if (output.trim() === "") {
    return { meaning: 0, language: 0, level: 0, facts: 0, chatter: 0, total: 0, notes: ["empty"] };
  }

  const obeyed = (benchmarkCase.obeyed ?? []).some((answer) => bare(output) === bare(answer));
  const forbidden = (benchmarkCase.forbidden ?? []).filter((term) =>
    fold(output).includes(fold(term)),
  );
  // Doing the task instead of rewriting it changes what the text is; an
  // addition the case forbids only oversteps the level.
  const didTheTask = obeyed || (forbidden.length > 0 && benchmarkCase.trap === "injection");

  const meaning = meaningOf(benchmarkCase, output, didTheTask);
  const language = languageOf(benchmarkCase, output);
  const level = levelOf(benchmarkCase, output, forbidden.length > 0 && !didTheTask);
  const facts = factsOf(benchmarkCase, output);
  const chatter = chatterNotes(benchmarkCase.input, output);
  const chatterScore = chatter.length === 0 ? 1 : 0;

  return {
    meaning: meaning.score,
    language: language.score,
    level: level.score,
    facts: facts.score,
    chatter: chatterScore,
    total: (meaning.score + language.score + level.score + facts.score + chatterScore) / 5,
    notes: [
      ...(obeyed ? ["obeyed an order found in the text"] : []),
      ...(forbidden.length > 0 ? [`forbidden: ${forbidden.join(", ")}`] : []),
      ...meaning.notes,
      ...language.notes,
      ...level.notes,
      ...facts.notes,
      ...chatter,
    ],
  };
}
