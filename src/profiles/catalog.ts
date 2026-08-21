import { BUILTIN_PROFILES, getBuiltinProfile, isBuiltinProfileAlias } from "./builtins.js";
import { customProfileToPromptProfile, type CustomProfile } from "./custom.js";
import { loadLocalProfileEntries, type LocalProfileEntry } from "./local-store.js";
import type { PromptProfile } from "./types.js";

/**
 * A local profile file that could not join the catalogue. It is reported, not
 * dropped: `rp profiles` prints it and every start-up warns about it, so a
 * typo in a stored file is never invisible.
 */
export interface ProfileCatalogProblem {
  /** The id derived from the file name, usable with `rp profiles remove`. */
  id: string;
  path: string;
  detail: string;
}

/**
 * Where a profile comes from, and therefore what may be done to it. Built-in
 * profiles ship with the binary and are never writable; local ones are files
 * the user owns. Every surface asks this rather than re-deriving it from an id
 * list, so "can I edit this?" has one answer.
 */
export type ProfileOrigin = "builtin" | "local";

export interface ProfileCatalog {
  readonly builtin: readonly PromptProfile[];
  readonly local: readonly PromptProfile[];
  readonly problems: readonly ProfileCatalogProblem[];
  /**
   * `false` until `loadProfileCatalog()` ran. Before that the catalogue is the
   * built-in list alone — an honest empty state, never a promise that no local
   * profile exists.
   */
  readonly loaded: boolean;
}

const EMPTY_CATALOG: ProfileCatalog = {
  builtin: BUILTIN_PROFILES,
  local: [],
  problems: [],
  loaded: false,
};

let current: ProfileCatalog = EMPTY_CATALOG;
let localById: ReadonlyMap<string, PromptProfile> = new Map();

function problemFrom(entry: LocalProfileEntry, detail: string): ProfileCatalogProblem {
  return { id: entry.id, path: entry.path, detail };
}

/**
 * Why a `custom.id` cannot join the catalogue, or `undefined` if it can.
 * Split out of `mergeLocalProfiles` so the merge loop stays a single
 * if/else — one reason to reject, one path to accept.
 */
function findCollisionReason(id: string, seen: ReadonlySet<string>): string | undefined {
  if (getBuiltinProfile(id)) {
    return `"${id}" is a built-in profile id.`;
  }
  if (isBuiltinProfileAlias(id)) {
    return `"${id}" is an alias of a built-in profile.`;
  }
  if (seen.has(id)) {
    return `"${id}" is already defined by another local file.`;
  }
  return undefined;
}

function resolveParentProfile(custom: CustomProfile): PromptProfile | undefined {
  return custom.extends === undefined ? undefined : getBuiltinProfile(custom.extends);
}

/**
 * Merges local entries into resolved profiles, refusing every collision
 * explicitly.
 *
 * A built-in id or a built-in alias always wins: the local file is reported as
 * a problem rather than shadowing a shipped profile. `extends` is resolved
 * here, so what leaves this function is directly usable by the engine.
 */
export function mergeLocalProfiles(entries: readonly LocalProfileEntry[]): {
  local: PromptProfile[];
  problems: ProfileCatalogProblem[];
} {
  const local: PromptProfile[] = [];
  const problems: ProfileCatalogProblem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const custom = entry.profile;
    if (!custom) {
      problems.push(
        problemFrom(entry, entry.error?.detail ?? entry.error?.message ?? "unreadable"),
      );
      continue;
    }

    const collision = findCollisionReason(custom.id, seen);
    if (collision !== undefined) {
      problems.push(problemFrom(entry, collision));
    } else {
      try {
        local.push(customProfileToPromptProfile(custom, resolveParentProfile(custom)));
        seen.add(custom.id);
      } catch (error) {
        problems.push(problemFrom(entry, error instanceof Error ? error.message : String(error)));
      }
    }
  }

  return { local, problems };
}

export interface LoadProfileCatalogOptions {
  profilesDir?: string;
}

/**
 * Reads the local profiles once and publishes the merged catalogue.
 *
 * Every start-up that may resolve a profile calls this before parsing input,
 * which is what keeps `listProfiles()`, `getProfile()` and `resolveProfile()`
 * synchronous and free of disk access — the TUI never reads a file while
 * rendering. It never throws: a directory that cannot be read becomes a
 * reported problem, so a broken local file can still be removed with
 * `rp profiles remove`.
 */
export async function loadProfileCatalog(
  options: LoadProfileCatalogOptions = {},
): Promise<ProfileCatalog> {
  let entries: LocalProfileEntry[] = [];
  const problems: ProfileCatalogProblem[] = [];
  try {
    entries = await loadLocalProfileEntries(options.profilesDir);
  } catch (error) {
    problems.push({
      id: "",
      path: options.profilesDir ?? "",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const merged = mergeLocalProfiles(entries);
  current = {
    builtin: BUILTIN_PROFILES,
    local: merged.local,
    problems: [...problems, ...merged.problems],
    loaded: true,
  };
  localById = new Map(merged.local.map((profile) => [profile.id, profile]));
  return current;
}

export function getProfileCatalog(): ProfileCatalog {
  return current;
}

export function getLocalProfile(id: string): PromptProfile | undefined {
  return localById.get(id);
}

/**
 * The origin of a resolvable profile id, or `undefined` when nothing answers to
 * it. Built-in wins by construction: the catalogue refuses a local file that
 * takes a built-in id or alias, so the two sets cannot overlap.
 */
export function getProfileOrigin(id: string): ProfileOrigin | undefined {
  if (getBuiltinProfile(id) ?? isBuiltinProfileAlias(id)) return "builtin";
  return localById.has(id) ? "local" : undefined;
}

/** Whether a profile may be edited, duplicated over, or deleted. */
export function isEditableProfile(id: string): boolean {
  return getProfileOrigin(id) === "local";
}

/** Back to the built-in-only state. Tests use it to stay independent. */
export function resetProfileCatalog(): void {
  current = EMPTY_CATALOG;
  localById = new Map();
}
