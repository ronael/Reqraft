/**
 * Turns a partially received provider response into displayable text.
 *
 * Providers answer with a JSON envelope, not prose, so streaming the raw bytes
 * shows `{"rewritten":"…\n\n– Objectif…"}` with literal escapes. The prompt
 * declares `rewritten` first, so its value can be read out as it arrives.
 */
export type StreamPreview =
  /** The provider ignored the JSON instruction; its text is already prose. */
  | { kind: "prose"; text: string }
  /** Prose read out of the `rewritten` field so far. */
  | { kind: "envelope"; text: string }
  /** An envelope has begun but `rewritten` has not been reached yet. */
  | { kind: "pending" };

const REWRITTEN_KEY = '"rewritten"';

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "\\": "\\",
  "/": "/",
};

export function previewRewritten(partial: string): StreamPreview {
  const trimmed = partial.trimStart();
  if (trimmed === "") {
    return { kind: "pending" };
  }
  if (!looksLikeEnvelope(trimmed)) {
    return { kind: "prose", text: partial };
  }

  const start = findValueStart(trimmed);
  if (start === undefined) {
    return { kind: "pending" };
  }

  return { kind: "envelope", text: decodeUntilClosingQuote(trimmed, start) };
}

/** A JSON object, possibly still wrapped in an opening markdown fence. */
function looksLikeEnvelope(trimmed: string): boolean {
  return trimmed.startsWith("{") || trimmed.startsWith("`");
}

/** Index just after the opening quote of the `rewritten` value. */
function findValueStart(text: string): number | undefined {
  const keyIndex = text.indexOf(REWRITTEN_KEY);
  if (keyIndex === -1) {
    return undefined;
  }

  const colonIndex = text.indexOf(":", keyIndex + REWRITTEN_KEY.length);
  if (colonIndex === -1) {
    return undefined;
  }

  const quoteIndex = text.indexOf('"', colonIndex + 1);
  return quoteIndex === -1 ? undefined : quoteIndex + 1;
}

interface DecodedEscape {
  value: string;
  /** Characters consumed, escape marker included. */
  consumed: number;
}

/**
 * Decodes one escape sequence.
 *
 * Returns undefined when the sequence is cut off by the chunk boundary, so a
 * half-decoded character is never emitted; the next fragment completes it.
 */
function decodeEscape(text: string, index: number): DecodedEscape | undefined {
  const marker = text[index + 1];
  if (marker === undefined) {
    return undefined;
  }
  if (marker !== "u") {
    return { value: SIMPLE_ESCAPES[marker] ?? marker, consumed: 2 };
  }

  const code = text.slice(index + 2, index + 6);
  if (code.length < 4) {
    return undefined;
  }
  return { value: String.fromCharCode(Number.parseInt(code, 16)), consumed: 6 };
}

/** Reads a JSON string body up to its closing quote, or to the end so far. */
function decodeUntilClosingQuote(text: string, start: number): string {
  let output = "";
  let index = start;

  while (index < text.length) {
    const character = text[index] ?? "";
    if (character === '"') {
      return output;
    }

    if (character === "\\") {
      const decoded = decodeEscape(text, index);
      if (!decoded) {
        return output;
      }
      output += decoded.value;
      index += decoded.consumed;
    } else {
      output += character;
      index += 1;
    }
  }

  return output;
}
