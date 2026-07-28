import type { PromptProfile } from "./types.js";
import { cleanProfile } from "./clean.js";
import { codeProfile } from "./code.js";
import { debugProfile } from "./debug.js";
import { frontendProfile } from "./frontend.js";
import { reviewProfile } from "./review.js";
import { webDesignProfile } from "./web-design.js";
import { writingProfile } from "./writing.js";
import { detectProfile } from "./auto.js";

export const BUILTIN_PROFILES: PromptProfile[] = [
  cleanProfile,
  codeProfile,
  frontendProfile,
  webDesignProfile,
  debugProfile,
  reviewProfile,
  writingProfile,
];

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
  if (id === "auto") {
    return undefined;
  }
  return PROFILES_BY_ID.get(id) ?? PROFILES_BY_ALIAS.get(id);
}

export function resolveProfile(
  requested: string,
  input: string,
): { profile: PromptProfile; detected: boolean } {
  if (requested === "auto") {
    const detectedId = detectProfile(input).profile;
    const profile = getProfile(detectedId);
    if (!profile) {
      return { profile: cleanProfile, detected: true };
    }
    return { profile, detected: true };
  }
  const profile = getProfile(requested);
  if (!profile) {
    throw new Error(`Profil inconnu : ${requested}`);
  }
  return { profile, detected: false };
}

export function listProfiles(): PromptProfile[] {
  return [...BUILTIN_PROFILES];
}
