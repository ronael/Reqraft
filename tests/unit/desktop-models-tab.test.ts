import { describe, expect, it } from "vitest";
import {
  initialSettingsTab,
  modelForProvider,
} from "@/apps/desktop/renderer/settings/SettingsApp.js";
import type { ProviderStatus } from "@/apps/desktop/shared/ipc-contract.js";
import { getFallbackModelForProvider, getPresetModels } from "@/models/presets.js";

/**
 * Changing the provider in the settings.
 *
 * The model used to stay put: picking OpenAI left `claude-haiku-4-5` in the
 * field, which the form accepted and the first run rejected.
 */

function provider(id: ProviderStatus["id"], models: [string, boolean][]): ProviderStatus {
  return {
    id,
    label: id,
    configured: true,
    source: "environment",
    requiresApiKey: true,
    supportsSecureAuth: true,
    models: models.map(([modelId, recommended]) => ({
      id: modelId,
      name: modelId,
      description: "",
      recommended,
    })),
  };
}

const openai = provider("openai", [
  ["gpt-4.1-mini", false],
  ["gpt-5.1", true],
]);

describe("modelForProvider", () => {
  it("passe au modèle recommandé du nouveau provider", () => {
    expect(modelForProvider(openai, "claude-haiku-4-5")).toBe("gpt-5.1");
  });

  it("garde un modèle que le nouveau provider publie déjà", () => {
    // Someone who deliberately chose GPT-4.1 mini keeps it when they come back
    // to OpenAI; the reset exists to fix impossible pairs, not to override.
    expect(modelForProvider(openai, "gpt-4.1-mini")).toBe("gpt-4.1-mini");
  });

  it("tombe sur le premier modèle quand aucun n'est recommandé", () => {
    const plain = provider("deepseek", [
      ["a-1", false],
      ["a-2", false],
    ]);
    expect(modelForProvider(plain, "claude-haiku-4-5")).toBe("a-1");
  });

  it("laisse l'identifiant en place pour un provider sans catalogue", () => {
    // A custom endpoint publishes nothing: whatever was typed is all there is,
    // and clearing it would silently discard the user's own model.
    const custom = provider("openai-compatible", []);
    expect(modelForProvider(custom, "mon-modele-local")).toBe("");
    expect(modelForProvider(undefined, "mon-modele-local")).toBe("mon-modele-local");
  });
});

describe("initialSettingsTab", () => {
  it("ouvre les profils par défaut", () => {
    expect(initialSettingsTab("")).toBe("profiles");
  });

  it("ouvre l'onglet préférences quand la relance le demande", () => {
    expect(initialSettingsTab("?surface=settings&tab=preferences")).toBe("preferences");
  });

  it("ignore un onglet inconnu", () => {
    expect(initialSettingsTab("?surface=settings&tab=language")).toBe("profiles");
  });
});

describe("le catalogue et les réglages disent la même chose", () => {
  it("recommande GPT-5.1 pour OpenAI", () => {
    // The setting, the CLI wizard and the desktop onboarding all read this.
    expect(getFallbackModelForProvider("openai")).toBe("gpt-5.1");
  });

  it("ne recommande qu'un seul modèle par provider", () => {
    // Two recommendations means the "recommandé" label appears twice and the
    // fallback silently picks whichever comes first in the file.
    const counts = new Map<string, number>();
    for (const preset of getPresetModels()) {
      if (preset.recommended) {
        counts.set(preset.provider, (counts.get(preset.provider) ?? 0) + 1);
      }
    }
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  });
});
