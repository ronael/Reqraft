import path from "node:path";
import process from "node:process";
import { writeFile } from "node:fs/promises";
import { loadConfig } from "@/config/loader.js";
import { loadProfileCatalog } from "@/profiles/catalog.js";
import type { CustomProfile } from "@/profiles/custom.js";
import {
  createLocalProfile,
  deleteLocalProfile,
  readLocalProfile,
  updateLocalProfile,
} from "@/profiles/local-store.js";
import { exportProfile } from "@/profiles/transfer.js";

/**
 * The profile operations the TUI is allowed to perform.
 *
 * An interface rather than direct imports, for two reasons. Tests drive the
 * whole flow against a temporary directory without touching the real
 * configuration. And the desktop app will implement the same six operations in
 * its main process behind IPC, so its renderer never touches the file system —
 * the shape it has to expose is written down here rather than rediscovered.
 *
 * Every implementation delegates to `src/profiles/`: no validation and no
 * persistence rule is restated on this side.
 */
export interface ProfileServices {
  /** Republishes the shared catalogue after a mutation. */
  reload(): Promise<void>;
  read(id: string): Promise<CustomProfile>;
  create(profile: CustomProfile): Promise<string>;
  update(profile: CustomProfile): Promise<string>;
  remove(id: string): Promise<void>;
  /** Writes a portable document and returns where it landed. */
  exportToFile(id: string): Promise<string>;
  /** The configured default, which must never be left pointing at nothing. */
  defaultProfile(): Promise<string>;
}

export interface CreateProfileServicesOptions {
  /** Overridden by tests; production reads the configured location. */
  profilesDir?: string;
  /** Where an export is written. Defaults to the working directory. */
  exportDir?: string;
}

export function createProfileServices(options: CreateProfileServicesOptions = {}): ProfileServices {
  const { profilesDir } = options;

  return {
    reload: async () => {
      await loadProfileCatalog({ profilesDir });
    },
    read: (id) => readLocalProfile(id, profilesDir),
    create: (profile) => createLocalProfile(profile, { profilesDir }),
    update: (profile) => updateLocalProfile(profile, { profilesDir }),
    remove: (id) => deleteLocalProfile(id, profilesDir),
    exportToFile: async (id) => {
      const result = await exportProfile(id, { profilesDir });
      // The working directory, not the profiles directory: a file written
      // beside the stored profiles would be globbed back as a profile on the
      // next start-up, and its derived id would be reported as invalid.
      const target = path.join(options.exportDir ?? process.cwd(), `${result.exportedId}.json`);
      await writeFile(target, result.json, "utf8");
      return target;
    },
    defaultProfile: async () => (await loadConfig()).defaultProfile,
  };
}
