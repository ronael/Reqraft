import { BUILTIN_PROFILES, getBuiltinProfile, isBuiltinProfileAlias } from "./builtins.js";
import { customProfileToPromptProfile, type CustomProfile } from "./custom.js";
import { loadLocalProfileEntries, type LocalProfileEntry } from "./local-store.js";
import type { PromptProfile } from "./types.js";
import { findProjectContext } from "@/config/project.js";

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
  /**
   * Cassé, ou seulement recouvert.
   *
   * Un profil masqué par celui d'un projet fonctionne parfaitement : il n'est
   * simplement pas celui qui s'applique ici. Le ranger avec les fichiers
   * illisibles apprendrait à ignorer les deux.
   */
  kind: "invalid" | "shadowed";
}

/**
 * Where a profile comes from, and therefore what may be done to it. Built-in
 * profiles ship with the binary and are never writable; local ones are files
 * the user owns. Every surface asks this rather than re-deriving it from an id
 * list, so "can I edit this?" has one answer.
 */
export type ProfileOrigin = "builtin" | "local" | "project";

export interface ProfileCatalog {
  readonly builtin: readonly PromptProfile[];
  readonly local: readonly PromptProfile[];
  /**
   * Les profils versionnés avec le dépôt, lus dans `.reqraft/profiles/`.
   *
   * Ils s'appliquent tant qu'on travaille dans le projet, et l'application ne
   * les modifie pas : ce sont des fichiers du dépôt, pas de la personne.
   */
  readonly project: readonly PromptProfile[];
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
  project: [],
  problems: [],
  loaded: false,
};

let current: ProfileCatalog = EMPTY_CATALOG;
let localById: ReadonlyMap<string, PromptProfile> = new Map();
let projectById: ReadonlyMap<string, PromptProfile> = new Map();

function problemFrom(
  entry: LocalProfileEntry,
  detail: string,
  kind: ProfileCatalogProblem["kind"] = "invalid",
): ProfileCatalogProblem {
  return { id: entry.id, path: entry.path, detail, kind };
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
export function mergeLocalProfiles(
  entries: readonly LocalProfileEntry[],
  /**
   * Les identifiants déjà pris par un profil de projet.
   *
   * Le projet l'emporte, comme sa configuration l'emporte : c'est ce que
   * « contexte par projet » veut dire. Mais le profil recouvert est signalé,
   * jamais effacé en silence — sans quoi une personne verrait son propre profil
   * cesser d'agir sans explication.
   */
  shadowedBy: ReadonlySet<string> = new Set(),
): {
  local: PromptProfile[];
  problems: ProfileCatalogProblem[];
} {
  const local: PromptProfile[] = [];
  const problems: ProfileCatalogProblem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const outcome = evaluateEntry(entry, seen, shadowedBy);
    if (outcome.kind === "refused") {
      problems.push(outcome.problem);
      continue;
    }

    const { custom } = outcome;
    try {
      local.push(customProfileToPromptProfile(custom, resolveParentProfile(custom)));
      seen.add(custom.id);
    } catch (error) {
      problems.push(problemFrom(entry, error instanceof Error ? error.message : String(error)));
    }
  }

  return { local, problems };
}

type EntryOutcome =
  { kind: "refused"; problem: ProfileCatalogProblem } | { kind: "accepted"; custom: CustomProfile };

/**
 * Si une entrée rejoint le catalogue, et sinon pourquoi.
 *
 * Séparé de la boucle pour que celle-ci garde une seule forme — un refus, ou
 * une résolution — et pour que les trois raisons de refuser se lisent
 * ensemble : fichier illisible, profil recouvert par le projet, identifiant
 * déjà pris.
 */
function evaluateEntry(
  entry: LocalProfileEntry,
  seen: ReadonlySet<string>,
  shadowedBy: ReadonlySet<string>,
): EntryOutcome {
  const custom = entry.profile;
  if (!custom) {
    return {
      kind: "refused",
      problem: problemFrom(entry, entry.error?.detail ?? entry.error?.message ?? "unreadable"),
    };
  }
  if (shadowedBy.has(custom.id)) {
    return {
      kind: "refused",
      problem: problemFrom(
        entry,
        `"${custom.id}" is defined by this project and wins here.`,
        "shadowed",
      ),
    };
  }
  const collision = findCollisionReason(custom.id, seen);
  if (collision !== undefined) {
    return { kind: "refused", problem: problemFrom(entry, collision) };
  }
  return { kind: "accepted", custom };
}

export interface LoadProfileCatalogOptions {
  profilesDir?: string;
  /**
   * `.reqraft/profiles/` du projet courant.
   *
   * `null` désactive la couche projet — ce que fait le desktop quand il n'a
   * pas de dossier de travail qui ait un sens. Absent, elle est cherchée en
   * remontant depuis le dossier courant.
   */
  projectProfilesDir?: string | null;
}

/** Lit un dossier de profils sans jamais lever : un dossier illisible devient un problème. */
async function readProfileEntries(
  directory: string | undefined,
): Promise<{ entries: LocalProfileEntry[]; problems: ProfileCatalogProblem[] }> {
  try {
    return { entries: await loadLocalProfileEntries(directory), problems: [] };
  } catch (error) {
    return {
      entries: [],
      problems: [
        {
          id: "",
          path: directory ?? "",
          detail: error instanceof Error ? error.message : String(error),
          kind: "invalid",
        },
      ],
    };
  }
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
  const projectDirectory =
    options.projectProfilesDir === undefined
      ? findProjectContext()?.profilesDirectory
      : (options.projectProfilesDir ?? undefined);

  // Le projet d'abord : ses identifiants décident lesquels des profils
  // personnels sont recouverts.
  const project =
    projectDirectory === undefined
      ? { entries: [], problems: [] }
      : await readProfileEntries(projectDirectory);
  const mergedProject = mergeLocalProfiles(project.entries);
  const projectIds = new Set(mergedProject.local.map((profile) => profile.id));

  const user = await readProfileEntries(options.profilesDir);
  const merged = mergeLocalProfiles(user.entries, projectIds);

  current = {
    builtin: BUILTIN_PROFILES,
    local: merged.local,
    project: mergedProject.local,
    problems: [
      ...project.problems,
      ...mergedProject.problems,
      ...user.problems,
      ...merged.problems,
    ],
    loaded: true,
  };
  localById = new Map(merged.local.map((profile) => [profile.id, profile]));
  projectById = new Map(mergedProject.local.map((profile) => [profile.id, profile]));
  return current;
}

export function getProfileCatalog(): ProfileCatalog {
  return current;
}

export function getLocalProfile(id: string): PromptProfile | undefined {
  // Le projet d'abord : il recouvre le profil personnel du même identifiant,
  // et le catalogue a déjà retiré celui-ci de `local`.
  return projectById.get(id) ?? localById.get(id);
}

export function getProjectProfile(id: string): PromptProfile | undefined {
  return projectById.get(id);
}

/**
 * The origin of a resolvable profile id, or `undefined` when nothing answers to
 * it. Built-in wins by construction: the catalogue refuses a local file that
 * takes a built-in id or alias, so the two sets cannot overlap.
 */
export function getProfileOrigin(id: string): ProfileOrigin | undefined {
  if (getBuiltinProfile(id) ?? isBuiltinProfileAlias(id)) return "builtin";
  if (projectById.has(id)) return "project";
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
  projectById = new Map();
}
