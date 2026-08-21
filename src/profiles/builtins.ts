import type { PromptProfile } from "./types.js";
import { cleanProfile } from "./clean.js";
import { codeProfile } from "./code.js";
import { debugProfile } from "./debug.js";
import { frontendProfile } from "./frontend.js";
import { reviewProfile } from "./review.js";
import { webDesignProfile } from "./web-design.js";
import { writingProfile } from "./writing.js";
import { BUILTIN_PROFILE_IDS } from "./profile-ids.js";

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

const BUILTIN_BY_ID = new Map<string, PromptProfile>();
const BUILTIN_BY_ALIAS = new Map<string, PromptProfile>();

for (const profile of BUILTIN_PROFILES) {
  BUILTIN_BY_ID.set(profile.id, profile);
  for (const alias of profile.aliases ?? []) {
    BUILTIN_BY_ALIAS.set(alias, profile);
  }
}

export function getBuiltinProfile(id: string): PromptProfile | undefined {
  return BUILTIN_BY_ID.get(id);
}

/**
 * Resolves a built-in alias — `web-designer` for `web-design`. Aliases are a
 * built-in privilege: a local profile may never take one (see
 * `catalog.ts#mergeLocalProfiles`), so this lookup can never be shadowed.
 */
export function getBuiltinProfileByAlias(alias: string): PromptProfile | undefined {
  return BUILTIN_BY_ALIAS.get(alias);
}

export function isBuiltinProfileAlias(name: string): boolean {
  return BUILTIN_BY_ALIAS.has(name);
}
