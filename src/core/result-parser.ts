import { z } from "zod";
import { AUTO_FALLBACK_PROFILE_ID, BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";

const ResultSchema = z.object({
  rewritten: z.string().min(1),
  /** Only present when the request used the `auto` profile (prompt-builder.ts#buildAutoDetectPrompt). */
  profile: z.string().optional(),
  changes: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export interface ParsedResult {
  rewritten: string;
  profile?: string;
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

/**
 * The first complete JSON object in the text, or null.
 *
 * A model that finishes its envelope and then keeps talking produces valid
 * JSON followed by prose. `JSON.parse` is all-or-nothing on that, so the good
 * answer was thrown away and the whole degenerate transcript surfaced as the
 * result — hundreds of repeated words where a clean rewrite already sat in the
 * first two hundred characters.
 *
 * Scans for the balanced closing brace, skipping braces inside strings and
 * honouring escapes, so a `{` in the rewritten text cannot end the object
 * early.
 */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let index = start;

  while (index < text.length) {
    if (text[index] === '"') {
      // Skip the whole literal: a brace inside it is text, not structure.
      index = endOfJsonString(text, index);
      continue;
    }
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
    index += 1;
  }
  return null;
}

/** Index just past the closing quote of the string literal opening at `open`. */
function endOfJsonString(text: string, open: number): number {
  for (let index = open + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === '"') return index + 1;
  }
  return text.length;
}

export function parseResult(text: string): ParsedResult {
  const cleaned = stripMarkdownFences(text);
  // Prefer the whole text; fall back to its first object so trailing chatter
  // does not cost the answer.
  const candidate = firstJsonObject(cleaned) ?? cleaned;

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const validated = ResultSchema.parse(parsed);
    return {
      rewritten: validated.rewritten,
      profile: validated.profile,
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

export interface DetectedProfileResolution {
  profileId: string;
  /**
   * True when `raw` was missing or not a recognised id, so `profileId` above
   * is the fixed fallback rather than something the model actually reported.
   * The caller uses this to raise `profile_detection_fallback` — see
   * `core/engine.ts` — without engine.ts having to re-check membership itself.
   */
  fellBack: boolean;
}

/**
 * Validates the `profile` the model reported for an `auto` request.
 *
 * The model is a text generator, not a trusted enum source: a missing field,
 * a malformed response, or a hallucinated id must not leak past this into a
 * string every other surface (i18n labels, capability parity, the TUI's
 * context row) assumes is one of `BUILTIN_PROFILE_IDS`. The fallback is a
 * fixed constant, not a guess — see `profiles/profile-ids.ts`.
 */
export function resolveDetectedProfileId(raw: string | undefined): DetectedProfileResolution {
  const isKnownId = (id: string): id is (typeof BUILTIN_PROFILE_IDS)[number] =>
    (BUILTIN_PROFILE_IDS as readonly string[]).includes(id);
  if (raw !== undefined && isKnownId(raw)) {
    return { profileId: raw, fellBack: false };
  }
  return { profileId: AUTO_FALLBACK_PROFILE_ID, fellBack: true };
}
