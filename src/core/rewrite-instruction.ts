/**
 * Detect a narrow, observable failure: an editing instruction followed by the
 * unchanged source, quoted or fenced. This is not a semantic intent judge.
 * Requests already about editing are excluded; a legitimate "rewrite this"
 * request must remain a request, not be executed by Reqraft.
 */
export function hasRewriteInstructionWrapper(input: string, output: string): boolean {
  const source = normalize(input);
  if (!/[\p{L}\p{N}]/u.test(source) || requestsEditing(source)) return false;

  const rewritten = normalize(output);
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
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
