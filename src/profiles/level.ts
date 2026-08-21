import type { RepromptLevel } from "@/core/types.js";
import { getProfile } from "./registry.js";

/**
 * Which level a generation actually runs at.
 *
 * Three sources, in a fixed order of precedence:
 *
 *   1. what the user asked for, right now (`--level`, Ctrl+L);
 *   2. the level the chosen profile defaults to;
 *   3. the level configured for the application.
 *
 * The user always outranks the profile, and that is not an arbitrary choice:
 * the prompt itself states it — "le niveau minimal est prioritaire sur le
 * profil" (`core/levels.ts`, `core/prompt-builder.ts`). A profile that could
 * impose its level would invert a rule the model is told to follow.
 *
 * `defaultLevel` was carried by every profile — built-in and local — and read
 * by nothing, so a profile's declared level had no effect at all. This is what
 * gives it one, without letting it override the person using it.
 */
export function resolveEffectiveLevel(options: {
  /** Explicitly requested for this run; wins over everything. */
  requested?: RepromptLevel;
  /** The profile in force, or `auto` when the model picks one. */
  profileId?: string;
  /** The application default, used when nothing else has an opinion. */
  configured: RepromptLevel;
}): RepromptLevel {
  if (options.requested !== undefined) return options.requested;

  // `auto` resolves to nothing here: no profile is chosen yet, so there is no
  // profile level to inherit. The model picks the profile during the run, well
  // after the level has to be fixed.
  const profile = options.profileId === undefined ? undefined : getProfile(options.profileId);
  return profile?.defaultLevel ?? options.configured;
}
