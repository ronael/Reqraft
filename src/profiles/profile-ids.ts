export const AUTO_PROFILE_ID = "auto";

/**
 * Where automatic detection lands when the model's response omits a usable
 * `profile` field (malformed JSON, an unrecognised id) — a fixed default, not
 * a guess: see `core/result-parser.ts#resolveDetectedProfileId`.
 */
export const AUTO_FALLBACK_PROFILE_ID = "clean";

export const BUILTIN_PROFILE_IDS = [
  "clean",
  "code",
  "frontend",
  "web-design",
  "debug",
  "review",
  "writing",
] as const;

export type BuiltinProfileId = (typeof BUILTIN_PROFILE_IDS)[number];
