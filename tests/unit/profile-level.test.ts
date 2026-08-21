import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveEffectiveLevel } from "@/profiles/level.js";
import { getBuiltinProfile } from "@/profiles/builtins.js";
import { loadProfileCatalog, resetProfileCatalog } from "@/profiles/catalog.js";
import { createLocalProfile } from "@/profiles/local-store.js";

/**
 * `defaultLevel` was declared by every profile and read by nothing: choosing a
 * profile had no effect on the level a generation ran at. These pin the
 * precedence that gives it one without letting a profile overrule the person.
 */

let profilesDir: string;

beforeEach(async () => {
  profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-level-"));
});

afterEach(async () => {
  resetProfileCatalog();
  await rm(profilesDir, { recursive: true, force: true });
});

describe("resolveEffectiveLevel", () => {
  it("lets an explicit request win over everything", () => {
    // The prompt tells the model the requested level outranks the profile; a
    // profile that could impose its own would invert that rule.
    expect(
      resolveEffectiveLevel({ requested: "minimal", profileId: "writing", configured: "complete" }),
    ).toBe("minimal");
  });

  it("takes the profile's level when nothing was requested", () => {
    const clean = getBuiltinProfile("clean");
    expect(clean?.defaultLevel).toBe("minimal");
    expect(resolveEffectiveLevel({ profileId: "clean", configured: "complete" })).toBe("minimal");
  });

  it("falls back to the configured level without a profile", () => {
    expect(resolveEffectiveLevel({ configured: "complete" })).toBe("complete");
  });

  it("keeps the configured level for auto", () => {
    // `auto` names no profile yet: the model chooses one during the run, long
    // after the level has to be fixed.
    expect(resolveEffectiveLevel({ profileId: "auto", configured: "standard" })).toBe("standard");
  });

  it("keeps the configured level for an unknown profile", () => {
    expect(resolveEffectiveLevel({ profileId: "jamais-vu", configured: "standard" })).toBe(
      "standard",
    );
  });

  it("honours a local profile's level", async () => {
    await createLocalProfile(
      {
        schemaVersion: 1,
        id: "brief-complet",
        name: "Brief complet",
        description: "Pour les demandes sous-spécifiées.",
        defaultLevel: "complete",
        instructions: "Structure la demande.",
      },
      { profilesDir },
    );
    await loadProfileCatalog({ profilesDir });

    expect(resolveEffectiveLevel({ profileId: "brief-complet", configured: "minimal" })).toBe(
      "complete",
    );
  });
});
