import { describe, expect, it } from "vitest";
import { detectProfile } from "../../src/profiles/auto.js";
import { getProfile, listProfiles, resolveProfile } from "../../src/profiles/registry.js";


describe("profile registry", () => {
  it("lists built-in profiles", () => {
    const profiles = listProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(7);
    const ids = profiles.map((p) => p.id);
    expect(ids).toContain("clean");
    expect(ids).toContain("code");
    expect(ids).toContain("frontend");
  });

  it("resolves profiles by id", () => {
    expect(getProfile("clean")?.id).toBe("clean");
    expect(getProfile("unknown")).toBeUndefined();
  });

  it("resolves aliases", () => {
    const profile = getProfile("web-designer");
    expect(profile?.id).toBe("web-design");
  });

  it("auto resolves a frontend request", () => {
    const { profile, detected } = resolveProfile("auto", "ajoute un bouton dans le dashboard");
    expect(detected).toBe(true);
    expect(profile.id).toBe("frontend");
  });

  it("auto falls back to clean on generic input", () => {
    const { profile, detected } = resolveProfile("auto", "bonjour comment vas tu aujourd'hui");
    expect(detected).toBe(true);
    expect(profile.id).toBe("clean");
  });

  it("auto falls back to clean on ambiguous input", () => {
    const { profile } = resolveProfile("auto", "code design bug");
    expect(profile.id).toBe("clean");
  });

  it("throws on unknown explicit profile", () => {
    expect(() => resolveProfile("nope", "test")).toThrow("Profil inconnu");
  });
});

describe("profile detector", () => {
  it("detects debug profile", () => {
    const result = detectProfile("j'ai une erreur 500 dans la console");
    expect(result.profile).toBe("debug");
  });

  it("detects code profile from code block", () => {
    const result = detectProfile("```ts\nconst x = 1\n```\nexplique");
    expect(result.profile).toBe("code");
  });
});
