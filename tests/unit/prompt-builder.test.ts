import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/core/prompt-builder.js";
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
    expect(systemPrompt).toContain("Une demande courte doit produire une reformulation courte");
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
});
