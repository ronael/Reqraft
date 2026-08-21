import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReqraftError } from "@/core/errors.js";
import { getBuiltinProfile } from "@/profiles/builtins.js";
import { parseCustomProfile, type CustomProfile } from "@/profiles/custom.js";
import {
  createLocalProfile,
  readLocalProfile,
  updateLocalProfile,
} from "@/profiles/local-store.js";
import { duplicateProfile, exportProfile, snapshotProfile } from "@/profiles/transfer.js";

const LOCAL: CustomProfile = {
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support client.",
  extends: "clean",
  defaultLevel: "standard",
  instructions: "Réponds avec empathie et précision.",
};

let profilesDir: string;

beforeEach(async () => {
  profilesDir = await mkdtemp(path.join(os.tmpdir(), "reqraft-transfer-"));
});

afterEach(async () => {
  await rm(profilesDir, { recursive: true, force: true });
});

describe("updateLocalProfile", () => {
  it("rewrites an existing profile in place", async () => {
    await createLocalProfile(LOCAL, { profilesDir });

    const filePath = await updateLocalProfile(
      { ...LOCAL, name: "Support niveau 2", instructions: "Escalade avec le contexte complet." },
      { profilesDir },
    );

    const stored = await readLocalProfile(LOCAL.id, profilesDir);
    expect(stored.name).toBe("Support niveau 2");
    expect(stored.instructions).toBe("Escalade avec le contexte complet.");
    expect(filePath).toBe(path.join(profilesDir, "support-client.reqraft-profile.json"));
  });

  it("refuses to create a profile that does not exist yet", async () => {
    // The mirror of createLocalProfile: `edit` on a mistyped id must fail
    // rather than quietly invent a profile under that name.
    await expect(updateLocalProfile(LOCAL, { profilesDir })).rejects.toThrow(ReqraftError);
    await expect(readLocalProfile(LOCAL.id, profilesDir)).rejects.toThrow(ReqraftError);
  });

  it("keeps the previous file when the replacement is invalid", async () => {
    await createLocalProfile(LOCAL, { profilesDir });

    await expect(updateLocalProfile({ ...LOCAL, name: "   " }, { profilesDir })).rejects.toThrow();

    const stored = await readLocalProfile(LOCAL.id, profilesDir);
    expect(stored.name).toBe("Support client");
  });
});

describe("snapshotProfile", () => {
  it("flattens a built-in into a standalone profile", async () => {
    const builtin = getBuiltinProfile("clean");
    const snapshot = await snapshotProfile("clean", "clean-local", profilesDir);

    expect(snapshot.fromBuiltin).toBe(true);
    // No `extends`: the copy has to survive the built-in changing its wording,
    // and has to be readable where Reqraft ships different built-ins.
    expect(snapshot.profile.extends).toBeUndefined();
    expect(snapshot.profile.instructions).toBe(builtin?.instructions);
    expect(snapshot.profile.id).toBe("clean-local");
  });

  it("keeps extends when the source is a local profile", async () => {
    await createLocalProfile(LOCAL, { profilesDir });

    const snapshot = await snapshotProfile(LOCAL.id, "support-bis", profilesDir);

    expect(snapshot.fromBuiltin).toBe(false);
    expect(snapshot.profile.extends).toBe("clean");
    expect(snapshot.profile.id).toBe("support-bis");
  });

  it("reports an unknown source", async () => {
    await expect(snapshotProfile("nowhere", "somewhere", profilesDir)).rejects.toMatchObject({
      errorCode: "profile.unknown",
    });
  });
});

describe("duplicateProfile", () => {
  it("produces a usable local profile from a built-in", async () => {
    const result = await duplicateProfile("clean", "clean-local", { profilesDir });

    expect(result.fromBuiltin).toBe(true);
    const stored = await readLocalProfile("clean-local", profilesDir);
    expect(stored.instructions).toBe(getBuiltinProfile("clean")?.instructions);
    expect(stored.extends).toBeUndefined();
    expect(result.path).toBe(path.join(profilesDir, "clean-local.reqraft-profile.json"));
  });

  it("copies a local profile and can rename it", async () => {
    await createLocalProfile(LOCAL, { profilesDir });

    await duplicateProfile(LOCAL.id, "support-bis", { profilesDir, name: "Support bis" });

    const copy = await readLocalProfile("support-bis", profilesDir);
    expect(copy.name).toBe("Support bis");
    expect(copy.instructions).toBe(LOCAL.instructions);
    // The source is untouched.
    const source = await readLocalProfile(LOCAL.id, profilesDir);
    expect(source.name).toBe("Support client");
  });

  it("never overwrites an existing target", async () => {
    await createLocalProfile(LOCAL, { profilesDir });

    await expect(duplicateProfile("clean", LOCAL.id, { profilesDir })).rejects.toThrow(
      ReqraftError,
    );

    const untouched = await readLocalProfile(LOCAL.id, profilesDir);
    expect(untouched.name).toBe("Support client");
  });

  it("refuses a target id that is not a valid custom id", async () => {
    await expect(duplicateProfile("clean", "Clean Copy", { profilesDir })).rejects.toThrow();
  });
});

describe("exportProfile", () => {
  it("exports a local profile unchanged and re-importable", async () => {
    await createLocalProfile(LOCAL, { profilesDir });

    const result = await exportProfile(LOCAL.id, { profilesDir });

    expect(result.exportedId).toBe(LOCAL.id);
    expect(result.renamedFrom).toBeUndefined();
    expect(parseCustomProfile(result.json)).toEqual(LOCAL);
  });

  it("renames a built-in so the document can actually be imported", async () => {
    // The schema refuses built-in ids, so exporting `clean` under its own id
    // would produce a file that exports cleanly and fails on import.
    const result = await exportProfile("clean", { profilesDir });

    expect(result.exportedId).toBe("clean-copy");
    expect(result.renamedFrom).toBe("clean");
    expect(() => parseCustomProfile(result.json)).not.toThrow();
  });

  it("honours an explicit export id", async () => {
    const result = await exportProfile("clean", { profilesDir, exportId: "ma-base" });

    expect(result.exportedId).toBe("ma-base");
    expect(parseCustomProfile(result.json).id).toBe("ma-base");
  });

  it("round-trips through the store", async () => {
    const exported = await exportProfile("writing", { profilesDir, exportId: "redaction" });
    await createLocalProfile(parseCustomProfile(exported.json), { profilesDir });

    const stored = await readLocalProfile("redaction", profilesDir);
    expect(stored.instructions).toBe(getBuiltinProfile("writing")?.instructions);

    const onDisk = await readFile(path.join(profilesDir, "redaction.reqraft-profile.json"), "utf8");
    expect(onDisk.endsWith("\n")).toBe(true);
  });
});
