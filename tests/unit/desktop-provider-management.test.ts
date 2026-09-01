import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import {
  registerIpcHandlers,
  sanitizeModelCatalog,
  type IpcEventLike,
  type IpcMainLike,
} from "@/apps/desktop/main/ipc.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type {
  ModelsListResponse,
  ProviderMutationResponse,
  ProviderTestResponse,
} from "@/apps/desktop/shared/ipc-contract.js";
import type { ModelInfo, ProviderAdapter, ProviderHealth } from "@/core/types.js";
import { findEndpointProblem } from "@/apps/desktop/renderer/settings/SettingsApp.js";
import {
  describeProviderSource,
  describeProviderTest,
  findDefaultProviderRow,
} from "@/apps/desktop/renderer/settings/ProviderRow.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

const t = createDesktopTranslator("fr");
const tEn = createDesktopTranslator("en");

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

describe("credential:save from the Desktop", () => {
  it("can replace a launch-environment key with the verified keychain value", async () => {
    const localIpc = new FakeIpcMain();
    const env = { ANTHROPIC_API_KEY: "launch-key" };
    let current = { ...DEFAULT_CONFIG };
    const storeCredential = vi.fn(() => Promise.resolve());
    const hydrateCredentials = vi.fn((target: NodeJS.ProcessEnv) => {
      target.ANTHROPIC_API_KEY ??= "stored-key";
      return Promise.resolve();
    });
    registerIpcHandlers({
      ipcMain: localIpc,
      clipboard: { writeText: vi.fn() },
      env,
      loadConfig: () => Promise.resolve(current),
      loadUserConfig: () => Promise.resolve(current),
      saveConfig: (next) => {
        current = next;
        return Promise.resolve();
      },
      hydrateCredentials,
      storeCredential,
      configFileExists: () => true,
    });

    const response = (await localIpc.invoke(IPC_CHANNELS.credentialSave, {
      provider: "anthropic",
      secret: "replacement-key",
      preferKeychain: true,
    })) as { providers: { id: string; source: string }[] };

    expect(storeCredential).toHaveBeenCalledWith("anthropic", "replacement-key", env);
    expect(current.desktopKeychainProviders).toContain("anthropic");
    expect(env.ANTHROPIC_API_KEY).toBe("stored-key");
    expect(response.providers.find((provider) => provider.id === "anthropic")?.source).toBe(
      "keychain",
    );
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

describe("quelle ligne porte le fournisseur par défaut", () => {
  it("désigne la ligne intégrée qui porte l'identifiant par défaut", () => {
    expect(findDefaultProviderRow("anthropic", ["local", "labo"])).toEqual({
      kind: "builtin",
      id: "anthropic",
    });
  });

  it("désigne le premier endpoint quand le défaut est openai-compatible", () => {
    // C'est la règle du registre : `Object.values(config.providers)[0]`.
    // L'indicateur suit ce que l'application fait, pas ce qu'elle devrait faire.
    expect(findDefaultProviderRow("openai-compatible", ["local", "labo"])).toEqual({
      kind: "endpoint",
      id: "local",
    });
  });

  it("ne désigne aucun autre endpoint que le premier", () => {
    const row = findDefaultProviderRow("openai-compatible", ["local", "labo", "prod"]);

    expect(row).not.toEqual({ kind: "endpoint", id: "labo" });
    expect(row).not.toEqual({ kind: "endpoint", id: "prod" });
  });

  it("ne désigne rien quand openai-compatible n'a aucun endpoint déclaré", () => {
    expect(findDefaultProviderRow("openai-compatible", [])).toBeUndefined();
  });

  it("ne marque aucun endpoint quand le défaut est un fournisseur intégré", () => {
    // Sinon la ligne « local » se dirait utilisée alors que c'est Mistral qui
    // répond : un indicateur faux est pire que pas d'indicateur du tout.
    expect(findDefaultProviderRow("mistral", ["local", "labo"])).toEqual({
      kind: "builtin",
      id: "mistral",
    });
  });

  it("annonce le défaut dans les deux langues, sans clé brute", () => {
    for (const translate of [t, tEn]) {
      const label = translate("settings.defaultBadge");
      expect(label).not.toContain("settings.");
      expect(translate("settings.defaultBadgeEndpointTitle")).toContain("endpoint");
    }

    expect(t("settings.defaultBadge")).toBe("Par défaut");
    expect(tEn("settings.defaultBadge")).toBe("Default");
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

/**
 * `providers:test` — checking one provider from the settings.
 *
 * The primitive is `validateConfiguration()`, the same one the diagnostic
 * calls. What is guarded here is the boundary around it: the request names a
 * provider from a closed list, the answer is a verdict rather than a sentence
 * an adapter wrote, and nothing that lives in the main process — a key from
 * the environment, one hydrated from the keychain, a custom header — comes
 * back with it.
 */

const KEYCHAIN_KEY = "sk-clé-du-trousseau-qui-ne-doit-pas-fuiter";
const ENV_KEY = "sk-clé-d-environnement-qui-ne-doit-pas-fuiter";

interface TestHarness {
  ipcMain: FakeIpcMain;
  /** Every `createProvider` call the handler made, in order. */
  calls: { id: string; env: NodeJS.ProcessEnv; config?: Config }[];
}

function testHarness(options: {
  health?: ProviderHealth | (() => Promise<ProviderHealth>);
  models?: ModelInfo[] | (() => Promise<ModelInfo[]>);
  config?: Partial<Config>;
  env?: NodeJS.ProcessEnv;
  throwOnCreate?: Error;
}): TestHarness {
  const localIpc = new FakeIpcMain();
  const calls: TestHarness["calls"] = [];
  const current: Config = { ...DEFAULT_CONFIG, ...options.config };

  registerIpcHandlers({
    ipcMain: localIpc,
    clipboard: { writeText: vi.fn() },
    env: options.env ?? {},
    loadConfig: () => Promise.resolve(current),
    saveConfig: () => Promise.resolve(),
    // Stands in for the keychain: the handler must build its provider from the
    // hydrated copy, not from the launch environment.
    hydrateCredentials: (target: NodeJS.ProcessEnv) => {
      target.ANTHROPIC_API_KEY ??= KEYCHAIN_KEY;
      return Promise.resolve();
    },
    configFileExists: () => true,
    createProvider: (id, env, config) => {
      calls.push({ id, env, ...(config === undefined ? {} : { config }) });
      if (options.throwOnCreate) throw options.throwOnCreate;
      const health = options.health ?? { ok: true };
      const adapter: ProviderAdapter = {
        id,
        name: id,
        generate: () => Promise.reject(new Error("jamais appelé")),
        validateConfiguration: () =>
          typeof health === "function" ? health() : Promise.resolve(health),
      };
      if (options.models !== undefined) {
        adapter.listModels = () =>
          typeof options.models === "function"
            ? options.models()
            : Promise.resolve(options.models ?? []);
      }
      return adapter;
    },
  });

  return { ipcMain: localIpc, calls };
}

describe("providers:test", () => {
  it("crée le provider après hydratation et rend un succès", async () => {
    const harnessed = testHarness({ health: { ok: true } });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
      kind: "builtin",
      id: "anthropic",
    })) as ProviderTestResponse;

    expect(response).toEqual({ id: "anthropic", outcome: "ok" });
    expect(harnessed.calls).toHaveLength(1);
    // La clé du trousseau doit être là où le provider la lit — et nulle part
    // ailleurs : c'est tout l'intérêt de la copie jetable.
    expect(harnessed.calls[0]?.env.ANTHROPIC_API_KEY).toBe(KEYCHAIN_KEY);
  });

  it("rend une configuration incomplète en nommant ce qui manque", async () => {
    const harnessed = testHarness({
      health: {
        ok: false,
        code: "missing_configuration",
        missingConfiguration: ["ANTHROPIC_API_KEY"],
      },
    });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
      kind: "builtin",
      id: "anthropic",
    })) as ProviderTestResponse;

    expect(response).toEqual({
      id: "anthropic",
      outcome: "missing_configuration",
      missing: ["ANTHROPIC_API_KEY"],
    });
  });

  it("distingue une configuration refusée d'un fournisseur injoignable", async () => {
    for (const [code, outcome] of [
      ["invalid_configuration", "invalid_configuration"],
      ["unreachable", "unreachable"],
    ] as const) {
      const harnessed = testHarness({ health: { ok: false, code } });
      const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
        kind: "builtin",
        id: "openai",
      })) as ProviderTestResponse;

      expect(response.outcome).toBe(outcome);
    }
  });

  it("rend un échec contrôlé quand le provider n'a rien conclu", async () => {
    // `ok: false` sans code : rien ne permet de dire pourquoi, donc rien ne
    // doit être promu en cause connue.
    const harnessed = testHarness({ health: { ok: false } });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
      kind: "builtin",
      id: "mistral",
    })) as ProviderTestResponse;

    expect(response).toEqual({ id: "mistral", outcome: "error" });
  });

  it("convertit une erreur du provider sans laisser fuiter son message", async () => {
    const secretMessage = `ECONNREFUSED https://interne.test/v1 avec ${ENV_KEY}`;
    const harnessed = testHarness({
      health: () => Promise.reject(new Error(secretMessage)),
    });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
      kind: "builtin",
      id: "deepseek",
    })) as ProviderTestResponse;

    expect(response).toEqual({ id: "deepseek", outcome: "error" });
    expect(JSON.stringify(response)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(response)).not.toContain(ENV_KEY);
  });

  it("convertit aussi une construction de provider qui échoue", async () => {
    const harnessed = testHarness({ throwOnCreate: new Error("provider.unsupported: anthropic") });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
      kind: "builtin",
      id: "anthropic",
    })) as ProviderTestResponse;

    expect(response).toEqual({ id: "anthropic", outcome: "error" });
  });

  it("ne laisse passer que des noms d'entrées de configuration", async () => {
    // `missingConfiguration` est écrit par l'adaptateur. Rien n'y met de valeur
    // aujourd'hui ; ce filtre est là pour que rien ne commence.
    const harnessed = testHarness({
      health: {
        ok: false,
        code: "missing_configuration",
        missingConfiguration: ["baseUrl", `Authorization: ${TOKEN}`],
      },
    });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
      kind: "builtin",
      id: "openai",
    })) as ProviderTestResponse;

    expect(response.missing).toEqual(["baseUrl"]);
    expect(JSON.stringify(response)).not.toContain(TOKEN);
  });

  it("teste l'endpoint compatible demandé, pas le premier de la liste", async () => {
    // Le registre construit le provider compatible à partir de la PREMIÈRE
    // entrée de `providers` : lui passer la carte entière testerait toujours
    // la même, quelle que soit la ligne cliquée.
    const harnessed = testHarness({
      config: {
        providers: {
          local: { type: "openai-compatible", baseUrl: "http://localhost:11434/v1" },
          distant: { type: "openai-compatible", baseUrl: "https://exemple.test/v1" },
        },
      },
    });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
      kind: "endpoint",
      id: "distant",
    })) as ProviderTestResponse;

    expect(response).toEqual({ id: "distant", outcome: "ok" });
    expect(harnessed.calls[0]?.id).toBe("openai-compatible");
    expect(Object.keys(harnessed.calls[0]?.config?.providers ?? {})).toEqual(["distant"]);
    expect(harnessed.calls[0]?.config?.providers?.distant?.baseUrl).toBe("https://exemple.test/v1");
  });

  it("signale la variable de clé absente d'un endpoint", async () => {
    const harnessed = testHarness({
      config: {
        providers: {
          distant: {
            type: "openai-compatible",
            baseUrl: "https://exemple.test/v1",
            apiKeyEnv: "DISTANT_API_KEY",
          },
        },
      },
    });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
      kind: "endpoint",
      id: "distant",
    })) as ProviderTestResponse;

    expect(response).toEqual({
      id: "distant",
      outcome: "missing_configuration",
      missing: ["DISTANT_API_KEY"],
    });
    expect(harnessed.calls).toEqual([]);
  });

  it("refuse un endpoint que la configuration ne connaît pas", async () => {
    const harnessed = testHarness({});

    await expect(
      harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, { kind: "endpoint", id: "fantome" }),
    ).rejects.toThrow(/No custom provider/);
    expect(harnessed.calls).toEqual([]);
  });

  it("refuse un payload hors contrat", async () => {
    const harnessed = testHarness({});
    const rejected = [
      undefined,
      { id: "anthropic" },
      { kind: "builtin" },
      { kind: "autre", id: "anthropic" },
      // `mock` répond `ok` quoi qu'il arrive : un test qui ne peut pas échouer.
      { kind: "builtin", id: "mock" },
      // Une famille, pas un endpoint : chaque endpoint se teste sur sa ligne.
      { kind: "builtin", id: "openai-compatible" },
      { kind: "builtin", id: "anthropic", secret: "x" },
      { kind: "endpoint", id: "Mon Serveur" },
      { kind: "endpoint", id: "" },
    ];

    for (const payload of rejected) {
      await expect(
        harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, payload),
        JSON.stringify(payload),
      ).rejects.toThrow();
    }
    expect(harnessed.calls).toEqual([]);
  });

  it("ne renvoie ni clé ni en-tête, quelle que soit l'issue", async () => {
    const harnessed = testHarness({
      env: { ANTHROPIC_API_KEY: ENV_KEY },
      config: {
        providers: {
          local: {
            type: "openai-compatible",
            baseUrl: "http://localhost:11434/v1",
            customHeaders: { Authorization: TOKEN },
          },
        },
      },
    });

    const responses = [
      await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
        kind: "builtin",
        id: "anthropic",
      }),
      await harnessed.ipcMain.invoke(IPC_CHANNELS.providerTest, {
        kind: "endpoint",
        id: "local",
      }),
    ];

    // Le provider, lui, a bien reçu de quoi travailler — c'est la preuve que
    // le filtrage porte sur ce qui traverse, pas sur ce qui est lu.
    expect(harnessed.calls[1]?.config?.providers?.local?.customHeaders).toEqual({
      Authorization: TOKEN,
    });
    const serialised = JSON.stringify(responses);
    expect(serialised).not.toContain(ENV_KEY);
    expect(serialised).not.toContain(KEYCHAIN_KEY);
    expect(serialised).not.toContain(TOKEN);
    expect(responses).toEqual([
      { id: "anthropic", outcome: "ok" },
      { id: "local", outcome: "ok" },
    ]);
  });
});

describe("models:list", () => {
  it("hydrate, valide puis renvoie un catalogue nettoyé et dédupliqué", async () => {
    const harnessed = testHarness({
      models: [
        { id: "gpt-5.1", name: " GPT 5.1\nLatest ", provider: "openai" },
        { id: "gpt-5.1", name: "duplicate", provider: "openai" },
        { id: "bad model", name: "ignored", provider: "openai" },
        { id: "o3-mini", name: "", provider: "openai" },
      ],
    });

    const response = (await harnessed.ipcMain.invoke(IPC_CHANNELS.modelsList, {
      kind: "builtin",
      id: "openai",
    })) as ModelsListResponse;

    expect(response).toEqual({
      id: "openai",
      outcome: "ok",
      models: [
        { id: "gpt-5.1", name: "GPT 5.1 Latest" },
        { id: "o3-mini", name: "o3-mini" },
      ],
      truncated: false,
    });
    expect(harnessed.calls[0]?.env.ANTHROPIC_API_KEY).toBe(KEYCHAIN_KEY);
  });

  it("répond unsupported sans inventer de catalogue", async () => {
    const harnessed = testHarness({ health: { ok: true } });

    const response = await harnessed.ipcMain.invoke(IPC_CHANNELS.modelsList, {
      kind: "builtin",
      id: "mock",
    });

    expect(response).toEqual({ id: "mock", outcome: "unsupported", models: [], truncated: false });
  });

  it("ne contacte pas le catalogue quand la configuration est incomplète", async () => {
    const listModels = vi.fn(() => Promise.resolve([]));
    const harnessed = testHarness({
      health: {
        ok: false,
        code: "missing_configuration",
        missingConfiguration: ["OPENAI_API_KEY"],
      },
      models: listModels,
    });

    const response = await harnessed.ipcMain.invoke(IPC_CHANNELS.modelsList, {
      kind: "builtin",
      id: "openai",
    });

    expect(response).toEqual({
      id: "openai",
      outcome: "missing_configuration",
      missing: ["OPENAI_API_KEY"],
      models: [],
      truncated: false,
    });
    expect(listModels).not.toHaveBeenCalled();
  });

  it("cible uniquement l'endpoint compatible demandé", async () => {
    const harnessed = testHarness({
      config: {
        providers: {
          local: { type: "openai-compatible", baseUrl: "http://localhost:11434/v1" },
          distant: { type: "openai-compatible", baseUrl: "https://example.test/v1" },
        },
      },
      models: [{ id: "local-model", name: "Local", provider: "openai-compatible" }],
    });

    await harnessed.ipcMain.invoke(IPC_CHANNELS.modelsList, {
      kind: "endpoint",
      id: "distant",
    });

    expect(Object.keys(harnessed.calls[0]?.config?.providers ?? {})).toEqual(["distant"]);
  });

  it("rend une erreur fermée sans message, URL ou secret", async () => {
    const secret = "sk-secret-catalogue";
    const harnessed = testHarness({
      env: { OPENAI_API_KEY: secret },
      models: () => Promise.reject(new Error(`ECONNREFUSED https://private.test avec ${secret}`)),
    });

    const response = await harnessed.ipcMain.invoke(IPC_CHANNELS.modelsList, {
      kind: "builtin",
      id: "openai",
    });

    expect(response).toEqual({ id: "openai", outcome: "error", models: [], truncated: false });
    expect(JSON.stringify(response)).not.toContain(secret);
    expect(JSON.stringify(response)).not.toContain("private.test");
  });

  it("ferme aussi l'erreur d'un endpoint valide mais absent de la configuration", async () => {
    const harnessed = testHarness({ models: [] });

    const response = await harnessed.ipcMain.invoke(IPC_CHANNELS.modelsList, {
      kind: "endpoint",
      id: "fantome",
    });

    expect(response).toEqual({ id: "fantome", outcome: "error", models: [], truncated: false });
  });

  it("refuse les identités ambiguës, inconnues ou enrichies", async () => {
    const harnessed = testHarness({ models: [] });
    const rejected = [
      undefined,
      { id: "openai" },
      { kind: "builtin", id: "openai-compatible" },
      { kind: "builtin", id: "openai", apiKey: "secret" },
      { kind: "endpoint", id: "Unknown Endpoint" },
    ];

    for (const payload of rejected) {
      await expect(
        harnessed.ipcMain.invoke(IPC_CHANNELS.modelsList, payload),
        JSON.stringify(payload),
      ).rejects.toThrow();
    }
  });

  it("borne un catalogue distant et indique la troncature", () => {
    const remote: unknown[] = Array.from({ length: 205 }, (_, index) => ({
      id: `model-${String(index)}`,
      name: `Model ${String(index)}`,
      provider: "test",
    }));
    remote.unshift(null, "not-a-model");

    const result = sanitizeModelCatalog(remote);

    expect(result.models).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(result.models.at(-1)?.id).toBe("model-199");
  });
});

describe("ce que le résultat d'un test annonce, côté renderer", () => {
  it("dit qu'une configuration locale est valide, dans les deux langues", () => {
    const ok = { id: "anthropic", outcome: "ok" } as const;

    expect(describeProviderTest(ok, t)).toContain("Configuration locale valide");
    expect(describeProviderTest(ok, tEn)).toContain("Local configuration is valid");
  });

  it("nomme ce qui manque quand la configuration est incomplète", () => {
    const result: ProviderTestResponse = {
      id: "anthropic",
      outcome: "missing_configuration",
      missing: ["ANTHROPIC_API_KEY"],
    };

    expect(describeProviderTest(result, t)).toContain("ANTHROPIC_API_KEY");
    expect(describeProviderTest(result, tEn)).toContain("ANTHROPIC_API_KEY");
  });

  it("reste lisible quand le provider n'a pas dit ce qui manque", () => {
    // Sans cela la phrase se terminait par « : . », ce qui se lit comme un bug.
    const phrase = describeProviderTest({ id: "anthropic", outcome: "missing_configuration" }, t);

    expect(phrase).toBe("Configuration incomplète.");
  });

  it("distingue un échec d'un succès pour chaque issue", () => {
    // Une issue traduite par sa propre clé afficherait `settings.providerTest…`
    // à l'écran, sans que rien n'échoue au build.
    for (const outcome of ["invalid_configuration", "unreachable", "error"] as const) {
      const phrase = describeProviderTest({ id: "openai", outcome }, t);
      expect(phrase, outcome).not.toContain("settings.");
      expect(phrase, outcome).not.toBe(describeProviderTest({ id: "openai", outcome: "ok" }, t));
    }
  });
});
