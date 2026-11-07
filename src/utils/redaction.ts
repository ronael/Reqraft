import { detectSecrets } from "@/core/secret-detector.js";

const REDACTED = "[REDACTED]";

interface Span {
  start: number;
  end: number;
}

/**
 * Masks every detected secret.
 *
 * Patterns overlap — an Anthropic or OpenAI key is also a 40-character run the
 * AWS pattern matches — so the matches are merged into disjoint spans first.
 * Replacing them one by one would use offsets the previous replacement
 * already shifted, and drop the text that follows the key.
 */
export function redactSecrets(input: string): string {
  const spans = detectSecrets(input)
    .map((match) => ({ start: match.position, end: match.position + match.value.length }))
    .sort((a, b) => a.start - b.start);

  const merged: Span[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push(span);
    }
  }

  let result = "";
  let cursor = 0;
  for (const span of merged) {
    result += input.slice(cursor, span.start) + REDACTED;
    cursor = span.end;
  }
  return result + input.slice(cursor);
}
