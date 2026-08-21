import { readFile, readdir, unlink } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { getProfilesDir } from "@/config/paths.js";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { writeAtomicFile } from "@/utils/atomic-write.js";
import {
  CUSTOM_PROFILE_ID_MAX_LENGTH,
  CUSTOM_PROFILE_ID_REGEX,
  CustomProfileSchema,
  isValidCustomProfileId,
  parseCustomProfile,
  serializeCustomProfile,
  type CustomProfile,
} from "./custom.js";
import { AUTO_PROFILE_ID, BUILTIN_PROFILE_IDS } from "./profile-ids.js";

const ERROR_CONFIG_VALUE_INVALID = "config.value_invalid" as const;
const ERROR_CONFIG_INVALID = "config.invalid" as const;
const ERROR_PROFILE_UNKNOWN = "profile.unknown" as const;

/**
 * A distinct suffix makes a profile recognizable outside Reqraft while
 * remaining standard JSON for editors and tooling.
 */
export const PROFILE_FILE_EXTENSION = ".reqraft-profile.json";

function isErrnoCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code;
}

function invalidId(expected: string, detail: string): ReqraftError {
  return new ReqraftError(ERROR_CONFIG_VALUE_INVALID, EXIT_CODES.INVALID_INPUT, {
    params: { key: "id", expected },
    detail,
  });
}

/**
 * Validates that an identifier is suitable for a local custom profile.
 * Refuses empty strings, invalid characters/patterns, `auto`, and built-in profile IDs.
 * The final check mirrors the schema so both entry points can never diverge.
 */
export function validateCustomProfileId(id: string): void {
  if (!id || typeof id !== "string") {
    throw invalidId("non-empty string", "Profile id cannot be empty.");
  }

  if (id.length > CUSTOM_PROFILE_ID_MAX_LENGTH) {
    throw invalidId(
      `at most ${String(CUSTOM_PROFILE_ID_MAX_LENGTH)} characters`,
      `Profile id is too long (${String(id.length)} characters, maximum ${String(CUSTOM_PROFILE_ID_MAX_LENGTH)}).`,
    );
  }

  if (!CUSTOM_PROFILE_ID_REGEX.test(id)) {
    throw invalidId(
      CUSTOM_PROFILE_ID_REGEX.source,
      `Invalid profile id format: "${id}". Must match ${CUSTOM_PROFILE_ID_REGEX.source}`,
    );
  }

  if (id === AUTO_PROFILE_ID) {
    throw invalidId(
      "non-reserved profile id",
      `Profile id "${id}" is reserved ("${AUTO_PROFILE_ID}").`,
    );
  }

  if ((BUILTIN_PROFILE_IDS as readonly string[]).includes(id)) {
    throw invalidId("non-builtin profile id", `Profile id "${id}" is a built-in profile.`);
  }

  if (!isValidCustomProfileId(id)) {
    throw invalidId(
      "portable profile id",
      `Profile id "${id}" cannot be used as a profile file name.`,
    );
  }
}

/**
 * Derives the absolute file path for a profile id inside the profiles directory.
 * Path is derived ONLY after strict id validation to prevent any directory traversal.
 */
export function getCustomProfilePath(id: string, profilesDir = getProfilesDir()): string {
  validateCustomProfileId(id);
  const resolvedDir = path.resolve(profilesDir);
  const targetFile = path.resolve(resolvedDir, `${id}${PROFILE_FILE_EXTENSION}`);

  // Extra safety check against directory traversal
  if (path.dirname(targetFile) !== resolvedDir) {
    throw new ReqraftError(ERROR_CONFIG_INVALID, EXIT_CODES.INVALID_INPUT, {
      params: { path: targetFile },
      detail: `Path traversal detected for profile id: "${id}"`,
    });
  }

  return targetFile;
}

/**
 * One local profile file, readable or not. An unusable file produces an entry
 * carrying its error instead of disappearing: callers decide whether to fail
 * or to report it, but no stored file is ever silently dropped.
 */
export interface LocalProfileEntry {
  /** The id derived from the file name, even when it is not a valid one. */
  id: string;
  path: string;
  profile?: CustomProfile;
  error?: ReqraftError;
}

/**
 * Reads every local profile file in `profilesDir`, one entry per file.
 * Ignores files without the dedicated profile suffix and hidden files. Never
 * throws for a single unusable file — the failure is attached to that file's
 * entry.
 */
export async function loadLocalProfileEntries(
  profilesDir = getProfilesDir(),
): Promise<LocalProfileEntry[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(profilesDir, { withFileTypes: true });
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return [];
    }
    throw error;
  }

  const jsonFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(PROFILE_FILE_EXTENSION) &&
        !entry.name.startsWith("."),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const loaded: LocalProfileEntry[] = [];
  for (const entry of jsonFiles) {
    const id = entry.name.slice(0, -PROFILE_FILE_EXTENSION.length);
    const filePath = path.join(profilesDir, entry.name);
    if (!isValidCustomProfileId(id)) {
      loaded.push({
        id,
        path: filePath,
        error: new ReqraftError(ERROR_CONFIG_INVALID, EXIT_CODES.INVALID_CONFIGURATION, {
          params: { path: filePath },
          detail: `"${entry.name}" is not a valid local profile file name: "${id}" cannot be a custom profile id.`,
        }),
      });
      continue;
    }

    try {
      loaded.push({ id, path: filePath, profile: await readLocalProfile(id, profilesDir) });
    } catch (error) {
      loaded.push({
        id,
        path: filePath,
        error:
          error instanceof ReqraftError
            ? error
            : new ReqraftError(ERROR_CONFIG_INVALID, EXIT_CODES.INVALID_CONFIGURATION, {
                params: { path: filePath },
                cause: error,
                detail: error instanceof Error ? error.message : String(error),
              }),
      });
    }
  }

  return loaded;
}

/**
 * Lists all valid custom profiles stored locally in getProfilesDir().
 * Ignores files without the dedicated profile suffix and hidden files.
 * Throws ReqraftError("config.invalid") if a local profile file is unusable:
 * unreadable, corrupted JSON, schema violation, or a name that is not a valid
 * profile id. A stored profile is never silently skipped.
 */
export async function listLocalProfiles(profilesDir = getProfilesDir()): Promise<CustomProfile[]> {
  const entries = await loadLocalProfileEntries(profilesDir);
  const profiles: CustomProfile[] = [];
  for (const entry of entries) {
    if (entry.error) throw entry.error;
    if (entry.profile) profiles.push(entry.profile);
  }
  return profiles;
}

/**
 * Reads and parses a single local custom profile by id.
 * Throws ReqraftError("profile.unknown") if the file does not exist.
 * Throws ReqraftError("config.invalid") if reading, parsing or schema validation fails.
 */
export async function readLocalProfile(
  id: string,
  profilesDir = getProfilesDir(),
): Promise<CustomProfile> {
  const filePath = getCustomProfilePath(id, profilesDir);

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      throw new ReqraftError(ERROR_PROFILE_UNKNOWN, EXIT_CODES.INVALID_INPUT, {
        params: { profile: id },
        cause: error,
        detail: `Local profile "${id}" not found at ${filePath}.`,
      });
    }
    throw new ReqraftError(ERROR_CONFIG_INVALID, EXIT_CODES.INVALID_CONFIGURATION, {
      params: { path: filePath },
      cause: error,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const parsed = parseCustomProfile(content);
    if (parsed.id !== id) {
      throw new Error(
        `Profile id inside file ("${parsed.id}") does not match filename id ("${id}").`,
      );
    }
    return parsed;
  } catch (error) {
    throw new ReqraftError(ERROR_CONFIG_INVALID, EXIT_CODES.INVALID_CONFIGURATION, {
      params: { path: filePath },
      cause: error,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface CreateLocalProfileOptions {
  profilesDir?: string;
}

/**
 * Atomically writes a new custom profile to disk with 0600 permissions.
 * Never overwrites: a profile id already taken is rejected, including when two
 * creations race for the same id.
 */
export async function createLocalProfile(
  profile: CustomProfile,
  options: CreateLocalProfileOptions = {},
): Promise<string> {
  const validated = CustomProfileSchema.parse(profile);
  const profilesDir = options.profilesDir ?? getProfilesDir();
  const filePath = getCustomProfilePath(validated.id, profilesDir);

  try {
    await writeAtomicFile(filePath, serializeCustomProfile(validated), {
      mode: 0o600,
      dirMode: 0o700,
      overwrite: false,
    });
  } catch (error) {
    if (isErrnoCode(error, "EEXIST")) {
      throw new ReqraftError(ERROR_CONFIG_INVALID, EXIT_CODES.INVALID_CONFIGURATION, {
        params: { path: filePath },
        cause: error,
        detail: `Local profile "${validated.id}" already exists at "${filePath}".`,
      });
    }
    throw error;
  }

  return filePath;
}

/**
 * Atomically rewrites an existing local profile.
 *
 * The mirror of `createLocalProfile`: that one refuses to overwrite, this one
 * refuses to create. An id with no file behind it is a mistyped id, not an
 * invitation to invent a profile — so `edit` can never silently produce one.
 *
 * The read before the write is the existence check; the write itself is atomic,
 * so a failure leaves the previous file intact rather than a truncated one.
 */
export async function updateLocalProfile(
  profile: CustomProfile,
  options: CreateLocalProfileOptions = {},
): Promise<string> {
  const validated = CustomProfileSchema.parse(profile);
  const profilesDir = options.profilesDir ?? getProfilesDir();
  const filePath = getCustomProfilePath(validated.id, profilesDir);

  // Throws profile.unknown when absent, which is exactly the wanted refusal.
  await readLocalProfile(validated.id, profilesDir);

  await writeAtomicFile(filePath, serializeCustomProfile(validated), {
    mode: 0o600,
    dirMode: 0o700,
    overwrite: true,
  });

  return filePath;
}

/**
 * Deletes an existing local custom profile file.
 * Throws ReqraftError("profile.unknown") if the profile does not exist.
 */
export async function deleteLocalProfile(
  id: string,
  profilesDir = getProfilesDir(),
): Promise<void> {
  const filePath = getCustomProfilePath(id, profilesDir);

  try {
    await unlink(filePath);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      throw new ReqraftError(ERROR_PROFILE_UNKNOWN, EXIT_CODES.INVALID_INPUT, {
        params: { profile: id },
        cause: error,
        detail: `Cannot delete profile "${id}": file not found at ${filePath}.`,
      });
    }
    throw error;
  }
}
