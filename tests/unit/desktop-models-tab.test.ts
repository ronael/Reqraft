import { describe, expect, it } from "vitest";
import {
  initialSettingsTab,
  settingsNavIndicatorOffset,
} from "@/apps/desktop/renderer/settings/SettingsApp.js";
import {
  describeModelCatalog,
  modelCatalogRequest,
  modelCatalogTone,
  modelForProvider,
} from "@/apps/desktop/renderer/settings/ModelsTab.js";
import type { ProviderStatus } from "@/apps/desktop/shared/ipc-contract.js";
import { getFallbackModelForProvider, getPresetModels } from "@/models/presets.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

const t = createDesktopTranslator("fr");

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
    expect(modelForProvider(custom, "mon-modele-local")).toBe("mon-modele-local");
    expect(modelForProvider(undefined, "mon-modele-local")).toBe("mon-modele-local");
  });
});

describe("modelCatalogRequest", () => {
  it("nomme directement un provider intégré", () => {
    expect(modelCatalogRequest("anthropic", undefined)).toEqual({
      kind: "builtin",
      id: "anthropic",
    });
  });

  it("nomme le premier endpoint réellement utilisé par openai-compatible", () => {
    expect(modelCatalogRequest("openai-compatible", "local")).toEqual({
      kind: "endpoint",
      id: "local",
    });
    expect(modelCatalogRequest("openai-compatible", undefined)).toBeUndefined();
  });

  it("laisse le renderer traduire chaque issue sans reprendre un message distant", () => {
    expect(describeModelCatalog({ status: "loading" }, t)).toContain("Chargement");
    expect(describeModelCatalog({ status: "error" }, t)).toContain("indisponible");
    expect(
      describeModelCatalog(
        {
          status: "ready",
          response: {
            id: "openai",
            outcome: "ok",
            models: [
              { id: "gpt-5.1", name: "GPT 5.1" },
              { id: "o3", name: "o3" },
            ],
            truncated: false,
          },
        },
        t,
      ),
    ).toBe("2 modèles disponibles.");
  });
});

describe("modelCatalogTone", () => {
  it("attend pendant le chargement", () => {
    expect(modelCatalogTone({ status: "loading" })).toBe("pending");
  });

  it("ne réserve l'erreur qu'à l'appel qui n'a pas abouti", () => {
    expect(modelCatalogTone({ status: "error" })).toBe("error");
    expect(modelCatalogTone({ status: "unavailable" })).toBe("info");
    expect(
      modelCatalogTone({
        status: "ready",
        response: { id: "openai-compatible", outcome: "unsupported", models: [], truncated: false },
      }),
    ).toBe("info");
  });

  it("confirme un catalogue chargé, avertit d'un catalogue vide", () => {
    const models = [{ id: "gpt-5.1", name: "GPT 5.1" }];
    expect(
      modelCatalogTone({
        status: "ready",
        response: { id: "openai", outcome: "ok", models, truncated: false },
      }),
    ).toBe("success");
    expect(
      modelCatalogTone({
        status: "ready",
        response: { id: "openai", outcome: "ok", models: [], truncated: false },
      }),
    ).toBe("warning");
  });

  it("avertit d'une configuration à compléter", () => {
    expect(
      modelCatalogTone({
        status: "ready",
        response: {
          id: "anthropic",
          outcome: "missing_configuration",
          models: [],
          truncated: false,
          missing: ["ANTHROPIC_API_KEY"],
        },
      }),
    ).toBe("warning");
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

describe("settingsNavIndicatorOffset", () => {
  it("aligne l'indicateur sur chaque ligne de navigation", () => {
    expect(settingsNavIndicatorOffset("profiles")).toBe(0);
    expect(settingsNavIndicatorOffset("providers")).toBe(38);
    expect(settingsNavIndicatorOffset("models")).toBe(76);
    expect(settingsNavIndicatorOffset("preferences")).toBe(114);
    expect(settingsNavIndicatorOffset("updates")).toBe(152);
    expect(settingsNavIndicatorOffset("diagnostic")).toBe(190);
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
