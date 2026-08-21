import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { getBuiltinProfile, getBuiltinProfileByAlias } from "./builtins.js";
import {
  CUSTOM_PROFILE_SCHEMA_VERSION,
  serializeCustomProfile,
  type CustomProfile,
} from "./custom.js";
import { createLocalProfile, readLocalProfile } from "./local-store.js";
import type { PromptProfile } from "./types.js";

/**
 * Moving a profile between the built-in set, the local files and the outside
 * world.
 *
 * Duplication and export are the same operation seen from two ends — both turn
 * a profile into a standalone JSON document — so they share one snapshot rule
 * and live together rather than being written twice in the CLI and again in the
 * TUI.
 */

const ERROR_PROFILE_UNKNOWN = "profile.unknown" as const;

/** Suffix used when a built-in has to be renamed to become importable. */
export const EXPORT_COPY_SUFFIX = "-copy";

export interface ProfileSnapshot {
  profile: CustomProfile;
  /** Whether the source was a built-in profile, which is never writable. */
  fromBuiltin: boolean;
}

function unknownProfile(id: string): ReqraftError {
  return new ReqraftError(ERROR_PROFILE_UNKNOWN, EXIT_CODES.INVALID_INPUT, {
    params: { profile: id },
    detail: `No built-in or local profile answers to "${id}".`,
  });
}

/**
 * A built-in rendered as a standalone custom profile.
 *
 * The instructions are copied in rather than referenced through `extends`: a
 * duplicate has to keep working if the built-in it came from later changes its
 * wording, and an exported file has to be readable on a machine whose Reqraft
 * ships different built-ins. `extends` would make both depend on the target
 * installation.
 */
function snapshotBuiltin(profile: PromptProfile, targetId: string): CustomProfile {
  return {
    schemaVersion: CUSTOM_PROFILE_SCHEMA_VERSION,
    id: targetId,
    name: profile.name,
    description: profile.description,
    defaultLevel: profile.defaultLevel,
    instructions: profile.instructions,
  };
}

/**
 * Reads a profile of either origin as a custom profile carrying `targetId`.
 *
 * A local source keeps its `extends`, because the parent is a built-in that the
 * reader also has; a built-in source is flattened by `snapshotBuiltin`.
 */
export async function snapshotProfile(
  sourceId: string,
  targetId: string,
  profilesDir?: string,
): Promise<ProfileSnapshot> {
  const builtin = getBuiltinProfile(sourceId) ?? getBuiltinProfileByAlias(sourceId);
  if (builtin) {
    return { profile: snapshotBuiltin(builtin, targetId), fromBuiltin: true };
  }

  let stored: CustomProfile;
  try {
    stored = await readLocalProfile(sourceId, profilesDir);
  } catch (error) {
    if (error instanceof ReqraftError && error.errorCode === ERROR_PROFILE_UNKNOWN) {
      throw unknownProfile(sourceId);
    }
    throw error;
  }

  return { profile: { ...stored, id: targetId }, fromBuiltin: false };
}

export interface DuplicateProfileOptions {
  /** Overrides the copied name, which otherwise repeats the source's. */
  name?: string;
  profilesDir?: string;
}

export interface DuplicateProfileResult {
  path: string;
  profile: CustomProfile;
  fromBuiltin: boolean;
}

/**
 * Copies any profile into a new local one.
 *
 * The write goes through `createLocalProfile`, so an id already taken is
 * refused there rather than checked here — one rule about overwriting, held in
 * one place, including against a concurrent creation.
 */
export async function duplicateProfile(
  sourceId: string,
  targetId: string,
  options: DuplicateProfileOptions = {},
): Promise<DuplicateProfileResult> {
  const snapshot = await snapshotProfile(sourceId, targetId, options.profilesDir);
  const profile: CustomProfile =
    options.name === undefined ? snapshot.profile : { ...snapshot.profile, name: options.name };

  const path = await createLocalProfile(profile, { profilesDir: options.profilesDir });
  return { path, profile, fromBuiltin: snapshot.fromBuiltin };
}

export interface ExportProfileResult {
  json: string;
  profile: CustomProfile;
  /** The id the export carries, which differs from the source for a built-in. */
  exportedId: string;
  /** Set when the id had to change for the document to be importable. */
  renamedFrom?: string;
}

/**
 * Serialises a profile as a portable, re-importable JSON document.
 *
 * A built-in cannot keep its own id: the schema refuses built-in ids, so a file
 * carrying one would export cleanly and fail on import. It is renamed — to
 * `exportId` when given, otherwise `<id>-copy` — and the caller is told, so the
 * rename is visible rather than discovered later by a failed import.
 */
export async function exportProfile(
  sourceId: string,
  options: { exportId?: string; profilesDir?: string } = {},
): Promise<ExportProfileResult> {
  const builtin = getBuiltinProfile(sourceId) ?? getBuiltinProfileByAlias(sourceId);
  const fallbackId = builtin ? `${builtin.id}${EXPORT_COPY_SUFFIX}` : sourceId;
  const exportedId = options.exportId ?? fallbackId;

  const snapshot = await snapshotProfile(sourceId, exportedId, options.profilesDir);

  return {
    json: serializeCustomProfile(snapshot.profile),
    profile: snapshot.profile,
    exportedId,
    renamedFrom: exportedId === sourceId ? undefined : sourceId,
  };
}
