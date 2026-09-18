/**
 * Detect a narrow, observable failure: an editing instruction followed by the
 * unchanged source, or an explicit delegation header around quoted rewritten
 * text. This is not a semantic intent judge.
 * Requests already about editing are excluded; a legitimate "rewrite this"
 * request must remain a request, not be executed by Reqraft.
 */
export function hasRewriteInstructionWrapper(input: string, output: string): boolean {
  const source = normalize(input);
  if (!/[\p{L}\p{N}]/u.test(source) || requestsEditing(source)) return false;

  const rewritten = normalize(output);
  if (hasExplicitDelegation(rewritten)) return true;
  const sourceIndex = rewritten.lastIndexOf(source);
  if (sourceIndex <= 0) return false;

  const prefix = rewritten.slice(0, sourceIndex);
  const suffix = rewritten.slice(sourceIndex + source.length);
  return (
    /^(?:please )?(?:clarifie|clarify|reformule|reformuler|reecris|rewrite|rephrase|corrige|corriger|correct|proofread)\b/u.test(
      prefix,
    ) &&
    endsWithSourceDelimiter(prefix) &&
    /^[\s"'»”`.!?]*$/u.test(suffix)
  );
}

function hasExplicitDelegation(output: string): boolean {
  // Require a request/text object and a quoted body, rather than treating every
  // imperative (e.g. "Corrige le titre") as a meta-instruction.
  const colon = output.indexOf(":");
  if (colon < 0 || colon > 240) return false;
  const header = output.slice(0, colon);
  const french =
    /^(?:reformule|reformuler|reecris|clarifie|corrige|corriger) (?:ma|mon|le|la|ce|cette) (?:demande|requete|texte|message|prompt)\b/u;
  const english =
    /^(?:please )?(?:rewrite|rephrase|clarify|correct|proofread) (?:my|this|the following) (?:request|text|message|prompt)\b/u;
  if (!french.test(header) && !english.test(header)) return false;
  const body = output.slice(colon + 1).trim();
  for (const [opening, closing] of [
    ['"', '"'],
    ["«", "»"],
    ["“", "”"],
    ["```", "```"],
  ] as const) {
    if (!body.startsWith(opening)) continue;
    const end = body.indexOf(closing, opening.length);
    return end > opening.length && /[\p{L}\p{N}]/u.test(body.slice(opening.length, end));
  }
  return false;
}

function requestsEditing(source: string): boolean {
  // Conservative exclusions include editing expressed without "rewrite",
  // e.g. "make this clearer" or "améliore ce message".
  return source
    .split(/[^\p{L}]+/u)
    .some((word) => EDITING_STEMS.some((stem) => word.startsWith(stem)));
}

const EDITING_STEMS = [
  "reformul",
  "corrig",
  "orthograph",
  "gramma",
  "reecri",
  "redig",
  "amelior",
  "clarifi",
  "rewrit",
  "rephras",
  "correct",
  "proofread",
  "polish",
  "clearer",
  "improv",
  "tradui",
  "translat",
] as const;
const SOURCE_OPENING = new Set([" ", '"', "'", "«", "“", "`"]);

function endsWithSourceDelimiter(prefix: string): boolean {
  let index = prefix.length - 1;
  while (index >= 0 && SOURCE_OPENING.has(prefix[index] ?? "")) index -= 1;
  return prefix[index] === ":";
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
