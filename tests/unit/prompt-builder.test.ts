import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/core/prompt-builder.js";
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
});
