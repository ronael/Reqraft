import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/core/prompt-builder.js";
import { codeProfile } from "../../src/profiles/code.js";
import { frontendProfile } from "../../src/profiles/frontend.js";
import { cleanProfile } from "../../src/profiles/clean.js";
import { BASE_RULES } from "../../src/profiles/base.js";

describe("profile instructions preservation", () => {
  it("code profile system prompt preserves technical terms instruction", () => {
    const { systemPrompt } = buildPrompt({
      input: "corrige Dashboard.tsx",
      profile: codeProfile,
      level: "standard",
      includeChanges: true,
    });
    expect(systemPrompt).toContain("préserver");
    expect(systemPrompt).toContain("ne jamais inventer");
  });

  it("frontend profile references the code profile rules", () => {
    const { systemPrompt } = buildPrompt({
      input: "ajoute un bouton",
      profile: frontendProfile,
      level: "standard",
      includeChanges: true,
    });
    expect(systemPrompt).toContain("framework");
    expect(systemPrompt).toContain("Ne invente pas");
  });

  it("clean profile does not add architecture instructions", () => {
    const { systemPrompt } = buildPrompt({
      input: "bonjour",
      profile: cleanProfile,
      level: "minimal",
      includeChanges: false,
    });
    expect(systemPrompt).not.toContain("framework");
    expect(systemPrompt).not.toContain("architecture");
  });
});

describe("base rules coverage", () => {
  it("contains all common rules", () => {
    const rules = BASE_RULES;
    expect(rules).toContain("Conserver strictement l'intention de l'utilisateur.");
    expect(rules).toContain(
      "Ne jamais inventer de fonctionnalité, contrainte, fichier ou décision.",
    );
    expect(rules).toContain("Ne pas répondre à la demande : uniquement la reformuler.");
  });
});
