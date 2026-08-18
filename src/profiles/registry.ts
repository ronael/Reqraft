import type { PromptProfile } from "./types.js";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { cleanProfile } from "./clean.js";
import { codeProfile } from "./code.js";
import { debugProfile } from "./debug.js";
import { frontendProfile } from "./frontend.js";
import { reviewProfile } from "./review.js";
import { webDesignProfile } from "./web-design.js";
import { writingProfile } from "./writing.js";
import { AUTO_PROFILE_ID, BUILTIN_PROFILE_IDS } from "./profile-ids.js";

export const BUILTIN_PROFILES: PromptProfile[] = [
  cleanProfile,
  codeProfile,
  frontendProfile,
  webDesignProfile,
  debugProfile,
  reviewProfile,
  writingProfile,
];

if (BUILTIN_PROFILES.map((profile) => profile.id).join("\0") !== BUILTIN_PROFILE_IDS.join("\0")) {
  throw new Error("La registry des profils ne respecte pas l'ordre des ids partagés.");
}

const PROFILES_BY_ID = new Map<string, PromptProfile>();
const PROFILES_BY_ALIAS = new Map<string, PromptProfile>();

for (const profile of BUILTIN_PROFILES) {
  PROFILES_BY_ID.set(profile.id, profile);
  if (profile.aliases) {
    for (const alias of profile.aliases) {
      PROFILES_BY_ALIAS.set(alias, profile);
    }
  }
}

export function getProfile(id: string): PromptProfile | undefined {
  if (id === AUTO_PROFILE_ID) {
    return undefined;
  }
  return PROFILES_BY_ID.get(id) ?? PROFILES_BY_ALIAS.get(id);
}

/**
 * Resolves what a requested profile id means for a generation.
 *
 * `auto` is not resolved here: no local heuristic decides it anymore. It is
 * passed through as the `"auto"` sentinel, and it is the model — in the same
 * call that produces the rewrite — that reports which profile it applied
 * (`core/prompt-builder.ts#buildAutoDetectPrompt`,
 * `core/result-parser.ts#resolveDetectedProfileId`). `detected` only tells the
 * caller whether detection is happening, not what it will find.
 */
export function resolveProfile(requested: string): {
  profile: PromptProfile | "auto";
  detected: boolean;
} {
  if (requested === AUTO_PROFILE_ID) {
    return { profile: "auto", detected: true };
  }
  const profile = getProfile(requested);
  if (!profile) {
    throw new ReqraftError("profile.unknown", EXIT_CODES.INVALID_INPUT, {
      params: { profile: requested },
    });
  }
  return { profile, detected: false };
}

export function listProfiles(): PromptProfile[] {
  return [...BUILTIN_PROFILES];
}
