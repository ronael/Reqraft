import { z } from "zod";

const ResultSchema = z.object({
  rewritten: z.string().min(1),
  changes: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export interface ParsedResult {
  rewritten: string;
  changes: string[];
  modelWarnings: string[];
  format: "structured" | "raw";
}

const FENCE = "```";
const FENCE_LANGUAGE = "json";

/**
 * Removes a surrounding markdown code fence.
 *
 * Deliberately implemented with string slicing rather than a regular
 * expression: the input is untrusted provider output, and a fence pattern
 * combining a lazy `[\s\S]*?` with an end anchor backtracks super-linearly on
 * an unterminated fence. Slicing keeps this linear, which matters because
 * parseResult must always return.
 */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith(FENCE) || !trimmed.endsWith(FENCE)) {
    return trimmed;
  }

  const body = trimmed.slice(FENCE.length, -FENCE.length);
  const withoutLanguage = body.startsWith(FENCE_LANGUAGE)
    ? body.slice(FENCE_LANGUAGE.length)
    : body;
  const content = withoutLanguage.trim();

  // An empty fence carries no payload; keep the original text unchanged.
  return content === "" ? trimmed : content;
}

export function parseResult(text: string): ParsedResult {
  const cleaned = stripMarkdownFences(text);

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const validated = ResultSchema.parse(parsed);
    return {
      rewritten: validated.rewritten,
      changes: validated.changes,
      modelWarnings: validated.warnings,
      format: "structured",
    };
  } catch {
    // Fallback: treat the whole text as rewritten if JSON parsing fails.
    return {
      rewritten: cleaned,
      changes: [],
      modelWarnings: [],
      format: "raw",
    };
  }
}
