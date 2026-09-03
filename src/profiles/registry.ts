import type { PromptProfile } from "./types.js";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { getBuiltinProfile, getBuiltinProfileByAlias } from "./builtins.js";
import { getLocalProfile, getProfileCatalog } from "./catalog.js";
import { AUTO_PROFILE_ID } from "./profile-ids.js";

export { BUILTIN_PROFILES } from "./builtins.js";

/**
 * The three functions below stay synchronous on purpose: every surface calls
 * them mid-render or mid-parse. The local half of the catalogue is loaded once
 * at start-up by `catalog.ts#loadProfileCatalog`; before that call they answer
 * with the built-in profiles alone.
 */
export function getProfile(id: string): PromptProfile | undefined {
  if (id === AUTO_PROFILE_ID) {
    return undefined;
  }
  // Built-in ids first, then local ids, then built-in aliases. A local profile
  // can hold neither a built-in id nor a built-in alias (the catalogue refuses
  // both), so this order can never hide a shipped profile.
  return getBuiltinProfile(id) ?? getLocalProfile(id) ?? getBuiltinProfileByAlias(id);
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

/**
 * Les intégrés d'abord, dans l'ordre du registre, puis ceux du projet, puis les
 * profils personnels, par nom de fichier.
 *
 * Ceux du projet passent avant : dans un dépôt qui en fournit, ce sont eux la
 * convention, et un sélecteur qui les enterre sous les profils personnels rate
 * ce que « contexte par projet » veut dire.
 */
export function listProfiles(): PromptProfile[] {
  const catalog = getProfileCatalog();
  return [...catalog.builtin, ...catalog.project, ...catalog.local];
}
