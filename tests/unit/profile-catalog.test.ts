import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProfileCatalog, loadProfileCatalog, resetProfileCatalog } from "@/profiles/catalog.js";
import { getProfile, listProfiles, resolveProfile } from "@/profiles/registry.js";
import { getBuiltinProfile } from "@/profiles/builtins.js";
import { BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";
import type { CustomProfile } from "@/profiles/custom.js";
import { getProfileOptions } from "@/apps/cli/ui/modal-options.js";
import { getInitProfileChoices } from "@/apps/cli/commands/first-run.js";
import { runProfilesList } from "@/apps/cli/commands/list.js";

const SUPPORT_PROFILE: CustomProfile = {
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support.",
  defaultLevel: "complete",
  instructions: "Réponds avec empathie.",
};

let profilesDir: string;

async function writeProfileFile(fileName: string, content: unknown): Promise<void> {
  await writeFile(
    path.join(profilesDir, fileName),
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
    "utf8",
  );
}

beforeEach(async () => {
  profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-catalog-"));
});

afterEach(async () => {
  resetProfileCatalog();
  await rm(profilesDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("shared profile catalogue", () => {
  it("answers with built-ins alone before it is loaded", () => {
    const catalog = getProfileCatalog();
    expect(catalog.loaded).toBe(false);
    expect(catalog.local).toEqual([]);
    expect(listProfiles().map((profile) => profile.id)).toEqual([...BUILTIN_PROFILE_IDS]);
  });

  it("reports an empty catalogue when the profiles directory does not exist", async () => {
    const catalog = await loadProfileCatalog({ profilesDir: path.join(profilesDir, "absent") });
    expect(catalog.loaded).toBe(true);
    expect(catalog.local).toEqual([]);
    expect(catalog.problems).toEqual([]);
  });

  it("publishes local profiles to the synchronous registry API", async () => {
    await writeProfileFile("support-client.reqraft-profile.json", SUPPORT_PROFILE);
    await loadProfileCatalog({ profilesDir });

    expect(listProfiles().map((profile) => profile.id)).toEqual([
      ...BUILTIN_PROFILE_IDS,
      "support-client",
    ]);
    expect(getProfile("support-client")?.name).toBe("Support client");

    const { profile, detected } = resolveProfile("support-client");
    expect(detected).toBe(false);
    expect(profile).not.toBe("auto");
    expect(profile === "auto" ? "" : profile.instructions).toBe("Réponds avec empathie.");
  });

  it("keeps built-in aliases resolvable once local profiles are loaded", async () => {
    await writeProfileFile("support-client.reqraft-profile.json", SUPPORT_PROFILE);
    await loadProfileCatalog({ profilesDir });

    expect(getProfile("web-designer")?.id).toBe("web-design");
    expect(getProfile("auto")).toBeUndefined();
  });

  it("resolves extends before the profile reaches the engine", async () => {
    await writeProfileFile("support-client.reqraft-profile.json", {
      ...SUPPORT_PROFILE,
      extends: "clean",
      defaultLevel: "complete",
    });
    await loadProfileCatalog({ profilesDir });

    const parent = getBuiltinProfile("clean");
    const local = getProfile("support-client");
    expect(local?.instructions).toBe(`${parent?.instructions ?? ""}\n\nRéponds avec empathie.`);
    // The child's mandatory level wins over the parent's.
    expect(local?.defaultLevel).toBe("complete");
    expect(parent?.defaultLevel).toBe("minimal");
  });

  it("refuses a local id colliding with a built-in alias and keeps the alias", async () => {
    await writeProfileFile("web-designer.reqraft-profile.json", {
      ...SUPPORT_PROFILE,
      id: "web-designer",
      name: "Faux web designer",
    });
    const catalog = await loadProfileCatalog({ profilesDir });

    expect(catalog.local).toEqual([]);
    expect(catalog.problems).toHaveLength(1);
    expect(catalog.problems[0]?.id).toBe("web-designer");
    expect(catalog.problems[0]?.detail).toContain("alias");
    expect(getProfile("web-designer")?.id).toBe("web-design");
  });

  it("refuses a local file named after a built-in profile", async () => {
    await writeProfileFile("clean.reqraft-profile.json", { ...SUPPORT_PROFILE, id: "clean" });
    const catalog = await loadProfileCatalog({ profilesDir });

    expect(catalog.local).toEqual([]);
    expect(catalog.problems).toHaveLength(1);
    expect(catalog.problems[0]?.path).toContain("clean.reqraft-profile.json");
    expect(getProfile("clean")?.name).toBe(getBuiltinProfile("clean")?.name);
  });

  it("reports every invalid file instead of skipping it silently", async () => {
    await writeProfileFile("broken-json.reqraft-profile.json", "{ not json");
    await writeProfileFile("unknown-field.reqraft-profile.json", {
      ...SUPPORT_PROFILE,
      id: "unknown-field",
      surprise: true,
    });
    await writeProfileFile("mismatched.reqraft-profile.json", {
      ...SUPPORT_PROFILE,
      id: "another-id",
    });
    await writeProfileFile("no-version.reqraft-profile.json", {
      id: "no-version",
      name: "Sans version",
      description: "Sans schemaVersion.",
      defaultLevel: "standard",
      instructions: "Rien.",
    });
    await writeProfileFile("support-client.reqraft-profile.json", SUPPORT_PROFILE);

    const catalog = await loadProfileCatalog({ profilesDir });

    expect(catalog.local.map((profile) => profile.id)).toEqual(["support-client"]);
    expect(
      catalog.problems.map((problem) => problem.id).sort((a, b) => a.localeCompare(b)),
    ).toEqual(["broken-json", "mismatched", "no-version", "unknown-field"]);
    for (const problem of catalog.problems) {
      expect(problem.detail.length).toBeGreaterThan(0);
      expect(problem.path).toContain(problem.id);
    }
  });

  it("ignores hidden files and JSON without the dedicated profile suffix", async () => {
    await writeProfileFile(".hidden.json", "{ not json");
    await writeProfileFile("notes.txt", "not a profile");
    await writeProfileFile("notes.json", "{ not a profile");
    await writeProfileFile("support-client.reqraft-profile.json", SUPPORT_PROFILE);

    const catalog = await loadProfileCatalog({ profilesDir });
    expect(catalog.problems).toEqual([]);
    expect(catalog.local.map((profile) => profile.id)).toEqual(["support-client"]);
  });

  it("returns to the built-in-only state on reset", async () => {
    await writeProfileFile("support-client.reqraft-profile.json", SUPPORT_PROFILE);
    await loadProfileCatalog({ profilesDir });
    resetProfileCatalog();

    expect(getProfile("support-client")).toBeUndefined();
    expect(() => resolveProfile("support-client")).toThrow("profile.unknown");
  });
});

describe("surfaces consuming the catalogue", () => {
  beforeEach(async () => {
    await writeProfileFile("support-client.reqraft-profile.json", SUPPORT_PROFILE);
    await loadProfileCatalog({ profilesDir });
  });

  it("offers the local profile in the TUI selector", () => {
    // The picker model the OpenTUI tree renders: synchronous, no disk access.
    const options = getProfileOptions();
    const local = options.find((option) => option.value === "support-client");

    expect(local).toBeDefined();
    expect(local?.label).toContain("Support client");
    expect(options[0]?.value).toBe("auto");
    // The selectable values, in order. The list also carries a trailing action
    // row for creating a profile, which is not a value anything can be set to.
    expect(
      options.filter((option) => option.kind !== "action").map((option) => option.value),
    ).toEqual(["auto", ...BUILTIN_PROFILE_IDS, "support-client"]);
    expect(options.at(-1)?.kind).toBe("action");
  });

  it("offers the local profile during first-run setup", () => {
    expect(getInitProfileChoices()).toContain("support-client");
  });

  it("lists built-in and local profiles separately", async () => {
    await writeProfileFile("broken-json.reqraft-profile.json", "{ not json");
    await loadProfileCatalog({ profilesDir });

    const logs: string[] = [];
    runProfilesList({
      log: (message) => logs.push(message),
    });
    const report = logs.join("\n");

    expect(report).toContain("Profils intégrés");
    expect(report).toContain("auto");
    expect(report).toContain("clean");
    expect(report).toContain("Profils locaux");
    expect(report).toContain("support-client");
    expect(report).toContain("Support client");
    expect(report).toContain("Fichiers locaux illisibles");
    expect(report).toContain("broken-json.reqraft-profile.json");
  });

  it("says so when no local profile exists", async () => {
    resetProfileCatalog();
    await loadProfileCatalog({ profilesDir: path.join(profilesDir, "absent") });

    const logs: string[] = [];
    runProfilesList({
      log: (message) => logs.push(message),
    });

    expect(logs.join("\n")).toContain("Aucun profil local");
  });
});
