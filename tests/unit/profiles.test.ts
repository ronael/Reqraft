import { describe, expect, it } from "vitest";
import { BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";
import { getProfile, listProfiles, resolveProfile } from "@/profiles/registry.js";

describe("profile registry", () => {
  it("lists built-in profiles", () => {
    const profiles = listProfiles();
    const ids = profiles.map((p) => p.id);
    expect(ids).toEqual([...BUILTIN_PROFILE_IDS]);
  });

  it("resolves profiles by id", () => {
    expect(getProfile("clean")?.id).toBe("clean");
    expect(getProfile("unknown")).toBeUndefined();
  });

  it("resolves aliases", () => {
    const profile = getProfile("web-designer");
    expect(profile?.id).toBe("web-design");
  });

  // `auto` is not resolved here anymore — see core/prompt-builder.ts
  // (buildAutoDetectPrompt) and core/result-parser.ts
  // (resolveDetectedProfileId) for what replaced the old local keyword
  // detector, and tests/unit/reprompt-use-case.test.ts for the flag this
  // returns end to end.
  it("defers auto to the model instead of resolving it locally", () => {
    const { profile, detected } = resolveProfile("auto");
    expect(profile).toBe("auto");
    expect(detected).toBe(true);
  });

  it("throws on unknown explicit profile", () => {
    expect(() => resolveProfile("nope")).toThrow("profile.unknown");
  });
});
