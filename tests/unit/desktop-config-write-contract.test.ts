import { describe, expect, it } from "vitest";
import type { Config } from "@/config/schema.js";
import {
  ConfigWriteRequestSchema,
  type ConfigWriteRequest,
} from "@/apps/desktop/shared/ipc-contract.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import { MOCK_CONFIG, setup } from "./desktop-ipc-harness.js";

/**
 * `config:write` était le seul canal ouvert du contrat.
 *
 * Il validait avec `ConfigSchema.partial()`, et `ConfigSchema` est
 * `passthrough` : n'importe quelle clé traversait, y compris celles que le
 * renderer n'a aucune raison d'écrire — `providers` (qui porte les en-têtes
 * d'authentification), `telemetry`, et l'état interne que le principal tient
 * lui-même (parcours de bienvenue, dernière mise à jour annoncée, choix de
 * trousseau). Le renderer est traité comme non fiable partout ailleurs ; ce
 * fichier fixe la même règle ici, et la liste blanche est celle des champs que
 * les écrans Desktop écrivent réellement.
 */

/** Les seuls champs que les écrans Desktop passent à `window.reqraft.writeConfig`. */
const WRITABLE_FIELDS = [
  // ModelsTab
  "defaultProvider",
  "defaultModel",
  "defaultLevel",
  // ProfilesTab
  "defaultProfile",
  // PreferencesTab
  "fidelityMode",
  "outputLanguage",
  "timeoutMs",
  "maxOutputTokens",
  // SettingsApp
  "uiLocale",
  "desktopShortcuts",
] as const;

/**
 * Ce qui n'a jamais à traverser ce canal.
 *
 * `providers` a son propre canal (`providers:save`), la télémétrie n'est pas un
 * réglage Desktop, et les trois `desktop*` restants sont de l'état que le
 * processus principal écrit lui-même — un renderer qui pourrait remettre
 * `desktopWelcomeTourVersion` à zéro ou déclarer un fournisseur « trousseau »
 * changerait un comportement que personne n'a demandé.
 */
const FORBIDDEN_FIELDS: Record<string, unknown> = {
  providers: { perso: { type: "openai-compatible", baseUrl: "https://llm.example.com" } },
  telemetry: true,
  desktopWelcomeTourVersion: 0,
  desktopNotifiedUpdateVersion: "9.9.9",
  desktopKeychainProviders: ["openai"],
  copyAfterGeneration: true,
  stream: false,
  showChanges: true,
  showStats: true,
};

describe("contrat config:write", () => {
  it("n'expose que les champs que les écrans Desktop éditent", () => {
    const alphabetically = (a: string, b: string): number => a.localeCompare(b);
    expect(Object.keys(ConfigWriteRequestSchema.shape).sort(alphabetically)).toEqual(
      [...WRITABLE_FIELDS].sort(alphabetically),
    );
  });

  it("accepte chacun de ces champs, un par un", () => {
    const samples: Record<(typeof WRITABLE_FIELDS)[number], unknown> = {
      defaultProvider: "openai",
      defaultModel: "gpt-4o-mini",
      defaultLevel: "complete",
      defaultProfile: "writing",
      fidelityMode: "strict",
      outputLanguage: "fr",
      timeoutMs: 45_000,
      maxOutputTokens: 2048,
      uiLocale: "fr",
      desktopShortcuts: { capture: "Command+Control+R" },
    };

    for (const field of WRITABLE_FIELDS) {
      const parsed = ConfigWriteRequestSchema.safeParse({ [field]: samples[field] });
      expect(parsed.success, `${field} devrait être accepté`).toBe(true);
    }
  });

  it("accepte le patch vide et un patch complet", () => {
    expect(ConfigWriteRequestSchema.parse({})).toEqual({});
    expect(
      ConfigWriteRequestSchema.safeParse({
        defaultProvider: "mock",
        defaultModel: "mock-model",
        defaultLevel: "minimal",
        defaultProfile: "auto",
        fidelityMode: "balanced",
        outputLanguage: "auto",
        timeoutMs: 1,
        maxOutputTokens: 10,
        uiLocale: "auto",
        desktopShortcuts: {},
      }).success,
    ).toBe(true);
  });

  it("laisse effacer une valeur optionnelle sans la deviner", () => {
    // Le champ « tokens maximum » vidé renvoie `undefined` : c'est le seul
    // moyen de revenir au réglage automatique, et le schéma doit le porter.
    const parsed = ConfigWriteRequestSchema.safeParse({ maxOutputTokens: undefined });
    expect(parsed.success).toBe(true);
  });

  it.each(Object.entries(FORBIDDEN_FIELDS))("refuse %s", (field, value) => {
    expect(ConfigWriteRequestSchema.safeParse({ [field]: value }).success).toBe(false);
  });

  it("refuse une clé inconnue", () => {
    expect(ConfigWriteRequestSchema.safeParse({ nimporteQuoi: 1 }).success).toBe(false);
    expect(
      ConfigWriteRequestSchema.safeParse({ defaultModel: "gpt-4o-mini", __proto__polluted: true })
        .success,
    ).toBe(false);
  });

  it("refuse une clé inconnue à l'intérieur des raccourcis", () => {
    expect(
      ConfigWriteRequestSchema.safeParse({ desktopShortcuts: { capture: "Command+Control+R" } })
        .success,
    ).toBe(true);
    expect(
      ConfigWriteRequestSchema.safeParse({ desktopShortcuts: { inconnu: "Command+Control+R" } })
        .success,
    ).toBe(false);
  });

  it("garde le type dérivé du schéma", () => {
    // Compile-time : le type reste `z.infer`, pas une interface recopiée.
    const patch: ConfigWriteRequest = { defaultModel: "gpt-4o-mini" };
    expect(ConfigWriteRequestSchema.parse(patch)).toEqual({ defaultModel: "gpt-4o-mini" });
  });
});

describe("config:write, du côté du processus principal", () => {
  it("écrit un champ autorisé et rend la configuration relue", async () => {
    const harness = setup({});

    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.configWrite,
      { defaultModel: "gpt-4o-mini" },
      harness.sender,
    )) as Config;

    expect(harness.saveConfig).toHaveBeenCalledOnce();
    expect((harness.saveConfig.mock.calls[0]?.[0] as Config).defaultModel).toBe("gpt-4o-mini");
    expect(response.defaultModel).toBe("gpt-4o-mini");
  });

  it("rejette un patch interdit sans rien écrire", async () => {
    const harness = setup({ config: { ...MOCK_CONFIG, telemetry: false } });

    await expect(
      harness.ipcMain.invoke(
        IPC_CHANNELS.configWrite,
        { defaultModel: "gpt-4o-mini", telemetry: true },
        harness.sender,
      ),
    ).rejects.toThrow();
    expect(harness.saveConfig).not.toHaveBeenCalled();
  });

  it("rejette un patch qui tenterait de redéfinir les fournisseurs", async () => {
    const harness = setup({});

    await expect(
      harness.ipcMain.invoke(
        IPC_CHANNELS.configWrite,
        {
          providers: {
            perso: {
              type: "openai-compatible",
              baseUrl: "https://exfiltration.example.com",
              customHeaders: { Authorization: "Bearer volé" },
            },
          },
        },
        harness.sender,
      ),
    ).rejects.toThrow();
    expect(harness.saveConfig).not.toHaveBeenCalled();
  });
});
