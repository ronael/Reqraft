import { describe, expect, it } from "vitest";
import { buildAutoDetectPrompt, buildPrompt } from "../../src/core/prompt-builder.js";
import { BUILTIN_PROFILE_IDS } from "../../src/profiles/profile-ids.js";
import { debugProfile } from "../../src/profiles/debug.js";
import { frontendProfile } from "../../src/profiles/frontend.js";
import { webDesignProfile } from "../../src/profiles/web-design.js";

describe("prompt builder", () => {
  it("tells standard web-design prompts to be actionable, not just corrected", () => {
    const { systemPrompt } = buildPrompt({
      input: "je voudrais que me crée une landing page style apple en respectant les convention",
      profile: webDesignProfile,
      level: "standard",
      includeChanges: false,
    });

    expect(systemPrompt).toContain("ne te limite pas à corriger");
    expect(systemPrompt).toContain("brief actionnable");
    expect(systemPrompt).toContain("Le champ rewritten doit contenir uniquement le prompt final");
    expect(systemPrompt).toContain("N'ajoute pas de sections");
    expect(systemPrompt).toContain(
      "Une demande courte doit rester concise, sauf si l’action demandée",
    );
    expect(systemPrompt).toContain("Si l'entrée mentionne des conventions sans précision");
  });

  it("keeps standard prompts compact for low latency", () => {
    const { systemPrompt } = buildPrompt({
      input: "je voudrais que me crée une landing page style apple en respectant les convention",
      profile: webDesignProfile,
      level: "standard",
      includeChanges: false,
    });

    expect(systemPrompt.length).toBeLessThan(1800);
  });

  it("makes complete prompts use structure only when it is useful", () => {
    const { systemPrompt } = buildPrompt({
      input: "fais une landing page style apple",
      profile: webDesignProfile,
      level: "complete",
      includeChanges: false,
    });

    expect(systemPrompt).toContain("uniquement lorsque la demande est complexe");
    expect(systemPrompt).toContain("ne résous pas les informations manquantes");
    expect(systemPrompt).not.toContain("exactement ces sections");
  });

  it("makes the minimal level override the debug profile checklist", () => {
    const { systemPrompt } = buildPrompt({
      input: "fix le bug mobile",
      profile: debugProfile,
      level: "minimal",
      includeChanges: false,
    });

    expect(systemPrompt).toContain("Le niveau minimal est prioritaire sur le profil");
    expect(systemPrompt).toContain("une seule phrase courte");
    expect(systemPrompt).not.toContain("étapes de reproduction");
  });

  it("keeps debug standard prompts proportional to the reported symptom", () => {
    const { systemPrompt } = buildPrompt({
      input: "fix le bug mobile",
      profile: debugProfile,
      level: "standard",
      includeChanges: false,
    });

    expect(systemPrompt).toContain("N'exige pas automatiquement logs, appareils, navigateurs");
    expect(systemPrompt).not.toContain("étapes de reproduction");
  });

  it("does not invent implementation details for an underspecified frontend fix", () => {
    const { systemPrompt } = buildPrompt({
      input: "corrige la page login",
      profile: frontendProfile,
      level: "standard",
      includeChanges: false,
    });

    expect(systemPrompt).toContain("sans symptôme précis");
    expect(systemPrompt).toContain("structure du code, champs ou validations");
  });

  it("keeps output language independent from UI localisation", () => {
    const { userPrompt } = buildPrompt({
      input: "Rewrite this request",
      profile: frontendProfile,
      level: "standard",
      outputLanguage: "fr",
      includeChanges: false,
    });

    expect(userPrompt).toContain("Langue attendue : fr");
    expect(userPrompt).toContain("Rewrite this request");
  });
});

/**
 * `auto`: no profile is resolved ahead of the call, so the merged prompt must
 * carry every profile's rules and ask the model to report which one it
 * applied — see core/engine.ts and core/result-parser.ts#resolveDetectedProfileId.
 */
describe("buildAutoDetectPrompt", () => {
  it("lists every built-in profile so the model can pick one", () => {
    const { systemPrompt } = buildAutoDetectPrompt({
      input: "ajoute un bouton dans le dashboard",
      level: "standard",
      includeChanges: true,
    });

    for (const id of BUILTIN_PROFILE_IDS) {
      expect(systemPrompt).toContain(id);
    }
    expect(systemPrompt).toContain("Aucun profil n'a été précisé");
  });

  it("asks for the chosen profile in the JSON contract", () => {
    const { systemPrompt } = buildAutoDetectPrompt({
      input: "ajoute un bouton",
      level: "standard",
      includeChanges: true,
    });

    expect(systemPrompt).toContain("rewritten (string), profile (string), changes (string[])");
  });

  it("collapses every profile's guidance into one shared note at the minimal level", () => {
    const { systemPrompt } = buildAutoDetectPrompt({
      input: "corrige juste ça",
      level: "minimal",
      includeChanges: true,
    });

    expect(systemPrompt).toContain("Le niveau minimal est prioritaire sur le profil retenu");
    // `describeLevel` contributes one occurrence of its own; the point is that
    // this note is not repeated once per candidate profile (it would say
    // "niveau minimal est prioritaire" seven times otherwise).
    expect(systemPrompt.match(/niveau minimal est prioritaire/gi)?.length).toBeLessThan(
      BUILTIN_PROFILE_IDS.length,
    );
  });

  it("keeps the same output-language footer as the explicit-profile prompt", () => {
    const { userPrompt } = buildAutoDetectPrompt({
      input: "Rewrite this request",
      level: "standard",
      outputLanguage: "fr",
      includeChanges: true,
    });

    expect(userPrompt).toContain("Langue attendue : fr");
  });
});
