import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROFILE_FILE_EXTENSION,
  createLocalProfile,
  loadLocalProfileEntries,
  deleteLocalProfile,
  getCustomProfilePath,
  listLocalProfiles,
  readLocalProfile,
  validateCustomProfileId,
} from "@/profiles/local-store.js";
import type { CustomProfile } from "@/profiles/custom.js";
import { AUTO_PROFILE_ID, BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";
import { ReqraftError } from "@/core/errors.js";

const SAMPLE_PROFILE: CustomProfile = {
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support client.",
  extends: "clean",
  defaultLevel: "standard",
  instructions: "Réponds avec empathie et précision.",
};

const SAMPLE_PROFILE_2: CustomProfile = {
  schemaVersion: 1,
  id: "tech-lead",
  name: "Tech lead",
  description: "Reformule pour les revues d architecture.",
  defaultLevel: "complete",
  instructions: "Sois rigoureux sur les contraintes et la clarté.",
};

describe("local profile store - id validation and path safety", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "rp-test-profiles-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("accepts valid kebab-case ids", () => {
    expect(() => {
      validateCustomProfileId("support-client");
    }).not.toThrow();
    expect(() => {
      validateCustomProfileId("my-custom-profile-1");
    }).not.toThrow();
    expect(() => {
      validateCustomProfileId("code-review");
    }).not.toThrow();
  });

  it("rejects empty or non-string ids", () => {
    expect(() => {
      validateCustomProfileId("");
    }).toThrow(ReqraftError);
    expect(() => {
      validateCustomProfileId("   ");
    }).toThrow(ReqraftError);
    expect(() => {
      validateCustomProfileId(null as unknown as string);
    }).toThrow(ReqraftError);
  });

  it("rejects invalid id formats", () => {
    expect(() => {
      validateCustomProfileId("SupportClient");
    }).toThrow(ReqraftError);
    expect(() => {
      validateCustomProfileId("support_client");
    }).toThrow(ReqraftError);
    expect(() => {
      validateCustomProfileId("-support");
    }).toThrow(ReqraftError);
    expect(() => {
      validateCustomProfileId("support-");
    }).toThrow(ReqraftError);
    expect(() => {
      validateCustomProfileId("support--client");
    }).toThrow(ReqraftError);
  });

  it("rejects auto sentinel id", () => {
    expect(() => {
      validateCustomProfileId(AUTO_PROFILE_ID);
    }).toThrow(ReqraftError);
  });

  it("rejects all built-in profile ids", () => {
    for (const builtinId of BUILTIN_PROFILE_IDS) {
      expect(() => {
        validateCustomProfileId(builtinId);
      }).toThrow(ReqraftError);
    }
  });

  it("derives file path strictly from validated id inside profiles dir", () => {
    const filePath = getCustomProfilePath("support-client", tempDir);
    expect(filePath).toBe(path.join(tempDir, "support-client.reqraft-profile.json"));
  });

  it("blocks directory traversal attempts", () => {
    expect(() => {
      getCustomProfilePath("../traversal", tempDir);
    }).toThrow(ReqraftError);
    expect(() => {
      getCustomProfilePath("../../etc/passwd", tempDir);
    }).toThrow(ReqraftError);
    expect(() => {
      getCustomProfilePath("/absolute/path", tempDir);
    }).toThrow(ReqraftError);
    expect(() => {
      getCustomProfilePath("sub/dir", tempDir);
    }).toThrow(ReqraftError);
    expect(() => {
      getCustomProfilePath("..\\windows\\path", tempDir);
    }).toThrow(ReqraftError);
  });
});

describe("local profile store - atomic creation, permissions, and collision prevention", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "rp-test-profiles-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("creates a profile file atomically with 0600 permissions", async () => {
    const targetDir = path.join(tempDir, "sub", "profiles");
    const filePath = await createLocalProfile(SAMPLE_PROFILE, { profilesDir: targetDir });

    expect(filePath).toBe(path.join(targetDir, "support-client.reqraft-profile.json"));

    const content = await readFile(filePath, "utf8");
    expect(JSON.parse(content)).toEqual(SAMPLE_PROFILE);

    if (process.platform !== "win32") {
      const stats = await stat(filePath);
      expect(stats.mode & 0o777).toBe(0o600);
    }
  });

  it("rejects collisions when creating an existing profile without overwrite", async () => {
    await createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir });

    await expect(createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir })).rejects.toThrow(
      ReqraftError,
    );

    await expect(
      createLocalProfile({ ...SAMPLE_PROFILE, name: "Another name" }, { profilesDir: tempDir }),
    ).rejects.toThrow(ReqraftError);
  });

  it("keeps the first write when concurrent creations race for the same id", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        createLocalProfile(
          { ...SAMPLE_PROFILE, name: `Support ${String(index)}` },
          { profilesDir: tempDir },
        ),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ReqraftError);
        expect((result.reason as ReqraftError).errorCode).toBe("config.invalid");
      }
    }

    const stored = await listLocalProfiles(tempDir);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe("support-client");
    expect(await readdir(tempDir)).toEqual(["support-client.reqraft-profile.json"]);
  });

  it("leaves no temporary file behind after a rejected collision", async () => {
    await createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir });
    await expect(createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir })).rejects.toThrow(
      ReqraftError,
    );

    expect(await readdir(tempDir)).toEqual(["support-client.reqraft-profile.json"]);
  });

  it("refuses to create a profile whose id is reserved or built-in", async () => {
    await expect(
      createLocalProfile({ ...SAMPLE_PROFILE, id: AUTO_PROFILE_ID }, { profilesDir: tempDir }),
    ).rejects.toThrow();
    await expect(
      createLocalProfile({ ...SAMPLE_PROFILE, id: "clean" }, { profilesDir: tempDir }),
    ).rejects.toThrow();

    expect(await listLocalProfiles(tempDir)).toEqual([]);
  });
});

describe("local profile store - reading, listing, and persistence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "rp-test-profiles-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("reads a persisted profile", async () => {
    await createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir });
    const loaded = await readLocalProfile("support-client", tempDir);
    expect(loaded).toEqual(SAMPLE_PROFILE);
  });

  it("throws ReqraftError(profile.unknown) when reading non-existent profile", async () => {
    await expect(readLocalProfile("non-existent", tempDir)).rejects.toThrow("profile.unknown");
  });

  it("throws ReqraftError(config.invalid) when reading corrupted JSON file", async () => {
    const filePath = path.join(tempDir, "broken-profile.reqraft-profile.json");
    await writeFile(filePath, "invalid json {", "utf8");

    await expect(readLocalProfile("broken-profile", tempDir)).rejects.toThrow("config.invalid");
  });

  it("throws ReqraftError(config.invalid) when profile id inside file does not match filename", async () => {
    const mismatched: CustomProfile = {
      ...SAMPLE_PROFILE,
      id: "different-id",
    };
    const filePath = path.join(tempDir, "support-client.reqraft-profile.json");
    await writeFile(filePath, JSON.stringify(mismatched), "utf8");

    await expect(readLocalProfile("support-client", tempDir)).rejects.toThrow("config.invalid");
  });

  it("returns empty array when directory does not exist", async () => {
    const nonExistentDir = path.join(tempDir, "not-here");
    const list = await listLocalProfiles(nonExistentDir);
    expect(list).toEqual([]);
  });

  it("returns empty array when directory is empty", async () => {
    const list = await listLocalProfiles(tempDir);
    expect(list).toEqual([]);
  });

  it("lists stored profiles sorted by filename", async () => {
    await createLocalProfile(SAMPLE_PROFILE_2, { profilesDir: tempDir });
    await createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir });

    const list = await listLocalProfiles(tempDir);
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe("support-client");
    expect(list[1]?.id).toBe("tech-lead");
  });

  it("ignores non-json files and hidden files", async () => {
    await createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir });
    await writeFile(path.join(tempDir, "README.md"), "# Profiles", "utf8");
    await writeFile(path.join(tempDir, ".DS_Store"), "ignore", "utf8");
    await writeFile(path.join(tempDir, ".tmp.1234"), "temp", "utf8");

    const list = await listLocalProfiles(tempDir);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("support-client");
  });

  it("throws ReqraftError(config.invalid) when a stored profile declares an unsupported schemaVersion", async () => {
    await writeFile(
      path.join(tempDir, "support-client.reqraft-profile.json"),
      JSON.stringify({ ...SAMPLE_PROFILE, schemaVersion: 2 }),
      "utf8",
    );

    await expect(readLocalProfile("support-client", tempDir)).rejects.toThrow("config.invalid");
    await expect(listLocalProfiles(tempDir)).rejects.toThrow("config.invalid");
  });

  it("throws ReqraftError(config.invalid) for a json file whose name is not a valid profile id", async () => {
    await createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir });
    await writeFile(path.join(tempDir, "Not A Profile.reqraft-profile.json"), "{}", "utf8");

    const error = await listLocalProfiles(tempDir).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReqraftError);
    expect((error as ReqraftError).errorCode).toBe("config.invalid");
    expect((error as ReqraftError).params?.path).toBe(
      path.join(tempDir, "Not A Profile.reqraft-profile.json"),
    );
  });

  it("fails with config.invalid if any profile file in directory is corrupted", async () => {
    await createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir });
    await writeFile(path.join(tempDir, "corrupted.reqraft-profile.json"), "invalid json", "utf8");

    await expect(listLocalProfiles(tempDir)).rejects.toThrow("config.invalid");
  });
});

describe("local profile store - deletion", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "rp-test-profiles-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("deletes an existing local profile", async () => {
    await createLocalProfile(SAMPLE_PROFILE, { profilesDir: tempDir });
    expect(await listLocalProfiles(tempDir)).toHaveLength(1);

    await deleteLocalProfile("support-client", tempDir);

    expect(await listLocalProfiles(tempDir)).toHaveLength(0);
    await expect(readLocalProfile("support-client", tempDir)).rejects.toThrow("profile.unknown");
  });

  it("throws ReqraftError(profile.unknown) when deleting non-existent profile", async () => {
    await expect(deleteLocalProfile("non-existent", tempDir)).rejects.toThrow("profile.unknown");
  });

  it("refuses to delete auto or built-in profile ids", async () => {
    await expect(deleteLocalProfile(AUTO_PROFILE_ID, tempDir)).rejects.toThrow(ReqraftError);
    for (const builtinId of BUILTIN_PROFILE_IDS) {
      await expect(deleteLocalProfile(builtinId, tempDir)).rejects.toThrow(ReqraftError);
    }
  });
});

describe("files that are not profiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "rp-test-ignored-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports a real profile that only lacks the suffix", async () => {
    // A valid profile under the wrong name would otherwise vanish without a
    // word, which is the failure this module exists to prevent.
    await writeFile(
      path.join(tempDir, "sans-suffixe.json"),
      JSON.stringify(SAMPLE_PROFILE),
      "utf8",
    );

    const entries = await loadLocalProfileEntries(tempDir);
    const reported = entries.find((entry) => entry.path.endsWith("sans-suffixe.json"));

    expect(reported).toBeDefined();
    expect(reported?.profile).toBeUndefined();
    expect(reported?.error?.detail).toContain(PROFILE_FILE_EXTENSION);
  });

  it("stays quiet about files that were never meant to be profiles", async () => {
    // Notes, an archive or a half-written file are not mistyped profiles, and
    // warning about them on every start-up would train the user to ignore the
    // warnings that do matter.
    await writeFile(path.join(tempDir, "notes.txt"), "rien", "utf8");
    await writeFile(path.join(tempDir, "sauvegarde.bak"), "rien", "utf8");
    await writeFile(path.join(tempDir, "brouillon.json"), "{ pas du json", "utf8");
    await writeFile(path.join(tempDir, "autre.json"), '{"quelque":"chose"}', "utf8");

    expect(await loadLocalProfileEntries(tempDir)).toEqual([]);
  });

  it("still ignores hidden files without reporting them", async () => {
    await writeFile(path.join(tempDir, ".DS_Store"), "rien", "utf8");
    expect(await loadLocalProfileEntries(tempDir)).toEqual([]);
  });
});
