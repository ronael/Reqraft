import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import {
  registerIpcHandlers,
  type IpcEventLike,
  type IpcMainLike,
} from "@/apps/desktop/main/ipc.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type { ProviderMutationResponse } from "@/apps/desktop/shared/ipc-contract.js";
import {
  describeProviderSource,
  findEndpointProblem,
} from "@/apps/desktop/renderer/settings/SettingsApp.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

const t = createDesktopTranslator("fr");

/**
 * Managing providers from the settings.
 *
 * Onboarding can declare an endpoint; without this, it could never be
 * corrected and a key could never be replaced without the CLI — which is the
 * dependency the desktop exists to remove.
 */

class FakeIpcMain implements IpcMainLike {
  private readonly handlers = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();

  handle(channel: string, listener: (event: IpcEventLike, payload: unknown) => unknown): void {
    this.handlers.set(channel, listener);
  }

  invoke(channel: string, payload?: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) return Promise.reject(new Error(`Aucun handler pour ${channel}`));
    try {
      return Promise.resolve(
        handler({ sender: { send: () => undefined, isDestroyed: () => false } }, payload),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

const TOKEN = "Bearer un-jeton-qui-ne-doit-pas-fuiter";

let ipcMain: FakeIpcMain;
let config: Config;
let saved: Config[];
let removed: string[];

function harness(initial?: Partial<Config>): void {
  ipcMain = new FakeIpcMain();
  saved = [];
  removed = [];
  config = { ...DEFAULT_CONFIG, ...initial };

  registerIpcHandlers({
    ipcMain,
    clipboard: { writeText: vi.fn() },
    env: {},
    loadConfig: () => Promise.resolve(config),
    saveConfig: (next) => {
      saved.push(next);
      config = next;
      return Promise.resolve();
    },
    hydrateCredentials: () => Promise.resolve(),
    configFileExists: () => true,
    removeCredential: (provider) => {
      removed.push(provider);
      return Promise.resolve();
    },
  });
}

beforeEach(() => {
  harness();
});

describe("providers:save", () => {
  it("enregistre un endpoint compatible", async () => {
    const response = (await ipcMain.invoke(IPC_CHANNELS.providerSave, {
      id: "local",
      name: "Ollama",
      baseUrl: "http://localhost:11434/v1",
    })) as ProviderMutationResponse;

    expect(saved[0]?.providers?.local).toMatchObject({
      type: "openai-compatible",
      name: "Ollama",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(response.config.providers?.local?.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("modifie un endpoint existant sans toucher aux autres", async () => {
    harness({
      providers: {
        local: { type: "openai-compatible", baseUrl: "http://localhost:11434/v1" },
        distant: { type: "openai-compatible", baseUrl: "https://exemple.test/v1" },
      },
    });

    await ipcMain.invoke(IPC_CHANNELS.providerSave, {
      id: "local",
      baseUrl: "http://localhost:8080/v1",
    });

    expect(saved[0]?.providers?.local?.baseUrl).toBe("http://localhost:8080/v1");
    expect(saved[0]?.providers?.distant?.baseUrl).toBe("https://exemple.test/v1");
  });

  it("conserve les en-têtes personnalisés que le renderer n'a jamais vus", async () => {
    // The guard this file exists for. `SafeConfig` strips `customHeaders`
    // because they can hold a token, so a save built from what the renderer
    // knows would erase them — silently, and only noticed on the next call.
    harness({
      providers: {
        local: {
          type: "openai-compatible",
          baseUrl: "http://localhost:11434/v1",
          customHeaders: { Authorization: TOKEN },
        },
      },
    });

    const response = (await ipcMain.invoke(IPC_CHANNELS.providerSave, {
      id: "local",
      baseUrl: "http://localhost:9999/v1",
    })) as ProviderMutationResponse;

    expect(saved[0]?.providers?.local?.customHeaders).toEqual({ Authorization: TOKEN });
    // Preserved on disk, still absent from what crosses the bridge.
    expect(JSON.stringify(response)).not.toContain(TOKEN);
  });

  it("refuse une URL sans schéma", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.providerSave, { id: "local", baseUrl: "localhost:11434" }),
    ).rejects.toThrow(/http:\/\//);
    expect(saved).toEqual([]);
  });

  it("refuse un identifiant non normalisé", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.providerSave, {
        id: "Mon Serveur",
        baseUrl: "http://localhost:11434/v1",
      }),
    ).rejects.toThrow(/lowercase/);
  });

  it("refuse un champ hors contrat", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.providerSave, {
        id: "local",
        baseUrl: "http://localhost:11434/v1",
        customHeaders: { Authorization: TOKEN },
      }),
    ).rejects.toThrow();
  });
});

describe("providers:delete", () => {
  it("supprime l'endpoint demandé", async () => {
    harness({
      providers: {
        local: { type: "openai-compatible", baseUrl: "http://localhost:11434/v1" },
        distant: { type: "openai-compatible", baseUrl: "https://exemple.test/v1" },
      },
    });

    const response = (await ipcMain.invoke(IPC_CHANNELS.providerDelete, {
      id: "local",
    })) as ProviderMutationResponse;

    expect(saved[0]?.providers?.local).toBeUndefined();
    expect(saved[0]?.providers?.distant).toBeDefined();
    expect(response.config.providers?.local).toBeUndefined();
  });

  it("ramène la configuration sur un provider utilisable quand le dernier part", async () => {
    // Otherwise the configuration still names `openai-compatible` with no
    // endpoint behind it: nothing to call, and no way to tell from the UI.
    harness({
      defaultProvider: "openai-compatible",
      defaultModel: "local-model",
      providers: { local: { type: "openai-compatible", baseUrl: "http://localhost:11434/v1" } },
    });

    const response = (await ipcMain.invoke(IPC_CHANNELS.providerDelete, {
      id: "local",
    })) as ProviderMutationResponse;

    expect(response.config.defaultProvider).toBe("anthropic");
    expect(response.config.defaultModel).toBe("claude-haiku-4-5");
  });

  it("ne déplace pas le défaut quand il reste un endpoint", async () => {
    harness({
      defaultProvider: "openai-compatible",
      providers: {
        local: { type: "openai-compatible", baseUrl: "http://localhost:11434/v1" },
        distant: { type: "openai-compatible", baseUrl: "https://exemple.test/v1" },
      },
    });

    const response = (await ipcMain.invoke(IPC_CHANNELS.providerDelete, {
      id: "local",
    })) as ProviderMutationResponse;

    expect(response.config.defaultProvider).toBe("openai-compatible");
  });

  it("refuse un identifiant inconnu", async () => {
    await expect(ipcMain.invoke(IPC_CHANNELS.providerDelete, { id: "fantome" })).rejects.toThrow(
      /No custom provider/,
    );
    expect(saved).toEqual([]);
  });
});

describe("credential:delete", () => {
  it("passe par le service credential partagé", async () => {
    await ipcMain.invoke(IPC_CHANNELS.credentialDelete, { provider: "anthropic" });

    expect(removed).toEqual(["anthropic"]);
  });

  it("refuse un fournisseur qui n'a pas de clé au trousseau", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.credentialDelete, { provider: "openai-compatible" }),
    ).rejects.toThrow(/keychain/);
    expect(removed).toEqual([]);
  });

  it("rend les statuts rafraîchis, sans valeur de clé", async () => {
    const response = await ipcMain.invoke(IPC_CHANNELS.credentialDelete, { provider: "openai" });

    expect(response).toHaveProperty("providers");
    expect(JSON.stringify(response)).not.toContain(TOKEN);
  });
});

describe("ce que les statuts disent aux réglages", () => {
  it("dit quels fournisseurs réclament une clé, et laquelle", async () => {
    const providers = (await ipcMain.invoke(IPC_CHANNELS.providersStatus)) as {
      id: string;
      label: string;
      requiresApiKey: boolean;
      envName?: string;
    }[];
    const anthropic = providers.find((provider) => provider.id === "anthropic");

    // Without this the settings could only print an identifier and guess.
    expect(anthropic).toMatchObject({
      label: "Anthropic",
      requiresApiKey: true,
      envName: "ANTHROPIC_API_KEY",
    });
  });

  it("n'exige pas de clé pour un endpoint compatible", async () => {
    const providers = (await ipcMain.invoke(IPC_CHANNELS.providersStatus)) as {
      id: string;
      requiresApiKey: boolean;
    }[];

    expect(providers.find((provider) => provider.id === "openai-compatible")?.requiresApiKey).toBe(
      false,
    );
  });
});

describe("le formulaire d'endpoint, côté renderer", () => {
  const form = {
    mode: "create" as const,
    id: "passerelle",
    name: "",
    baseUrl: "https://passerelle.test/v1",
    apiKeyEnv: "",
  };

  it("accepte un formulaire complet", () => {
    expect(findEndpointProblem(form, ["local"], t)).toBeUndefined();
  });

  it("refuse un identifiant déjà pris, sauf sur une modification", () => {
    expect(findEndpointProblem({ ...form, id: "local" }, ["local"], t)).toContain("déjà pris");
    // Editing keeps its own id: that is not a collision with itself.
    expect(
      findEndpointProblem({ ...form, mode: "update", id: "local" }, ["local"], t),
    ).toBeUndefined();
  });

  it("refuse un identifiant non normalisé", () => {
    expect(findEndpointProblem({ ...form, id: "Mon Serveur" }, [], t)).toContain("minuscules");
  });

  it("refuse une URL sans schéma", () => {
    // `localhost:8080` parses, with `localhost:` as its protocol, and would
    // only fail on the first request.
    expect(findEndpointProblem({ ...form, baseUrl: "localhost:8080" }, [], t)).toContain("http://");
  });

  it("réclame un identifiant", () => {
    expect(findEndpointProblem({ ...form, id: "  " }, [], t)).toContain("identifiant");
  });
});

describe("ce que la ligne d'un fournisseur annonce", () => {
  const provider = {
    id: "anthropic" as const,
    label: "Anthropic",
    configured: true,
    source: "keychain" as const,
    models: [],
    requiresApiKey: true,
    supportsSecureAuth: true,
    envName: "ANTHROPIC_API_KEY",
  };

  it("nomme la variable quand la clé vient de l'environnement", () => {
    expect(describeProviderSource({ ...provider, source: "environment" }, t)).toContain(
      "ANTHROPIC_API_KEY",
    );
  });

  it("ne réclame pas de clé à un fournisseur qui n'en demande pas", () => {
    expect(
      describeProviderSource(
        {
          ...provider,
          requiresApiKey: false,
          configured: false,
          source: "not_configured",
        },
        t,
      ),
    ).toContain("Aucune clé nécessaire");
  });

  it("dit clairement qu'aucune clé n'est enregistrée", () => {
    expect(
      describeProviderSource({ ...provider, configured: false, source: "not_configured" }, t),
    ).toContain("Aucune clé enregistrée");
  });
});

describe("une suppression de clé se confirme avant d'agir", () => {
  it("ne supprime rien tant que la confirmation n'est pas donnée", () => {
    // The reason this exists: a single misplaced click destroyed a key, and
    // the keychain has no undo — an API key cannot be read back afterwards.
    expect(removed).toEqual([]);
  });

  it("supprime bien quand la confirmation arrive", async () => {
    await ipcMain.invoke(IPC_CHANNELS.credentialDelete, { provider: "anthropic" });

    expect(removed).toEqual(["anthropic"]);
  });
});
