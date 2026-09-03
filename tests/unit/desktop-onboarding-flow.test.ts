import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigSchema, type Config } from "@/config/schema.js";
import {
  registerIpcHandlers,
  type IpcEventLike,
  type IpcMainLike,
} from "@/apps/desktop/main/ipc.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type {
  OnboardingCompleteResponse,
  OnboardingStateResponse,
} from "@/apps/desktop/shared/ipc-contract.js";
import {
  describeCredentialSource,
  findOnboardingProblem,
} from "@/apps/desktop/renderer/onboarding/OnboardingApp.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";

const t = createDesktopTranslator("fr");

/**
 * Blank machine → onboarding → configuration on disk → usable installation.
 *
 * The configuration is a real file here, written and read back through the
 * shared schema, because the promise being tested is that the desktop produces
 * the same file the CLI would: someone who never installed the CLI ends up
 * with a configuration `rp` could pick up unchanged.
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

const SECRET = "sk-ant-not-a-real-key-1234567890";

let dir: string;
let file: string;
let ipcMain: FakeIpcMain;
let env: NodeJS.ProcessEnv;
let opened: number;

/** Reads the configuration the way the loader does: file, then schema. */
async function readSavedConfig(): Promise<Config> {
  return ConfigSchema.parse(JSON.parse(await readFile(file, "utf8")));
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "rp-onboarding-"));
  file = path.join(dir, "config.json");
  ipcMain = new FakeIpcMain();
  env = {};
  opened = 0;

  registerIpcHandlers({
    ipcMain,
    clipboard: { writeText: vi.fn() },
    env,
    configFileExists: () => existsSync(file),
    loadConfig: async () => (existsSync(file) ? await readSavedConfig() : ConfigSchema.parse({})),
    saveConfig: async (next) => {
      await writeFile(file, JSON.stringify(next, null, 2), "utf8");
    },
    // Stands in for the keychain: storing a key is what makes it detectable
    // on the next read, which is exactly what the flow depends on.
    hydrateCredentials: (target) => {
      if (env.__stored) target.ANTHROPIC_API_KEY = env.__stored;
      return Promise.resolve();
    },
    storeCredential: (_provider, secret) => {
      env.__stored = secret;
      return Promise.resolve();
    },
    onOnboardingComplete: () => {
      opened += 1;
    },
  });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

async function state(): Promise<OnboardingStateResponse> {
  return (await ipcMain.invoke(IPC_CHANNELS.onboardingState)) as OnboardingStateResponse;
}

describe("configuration vierge → application utilisable", () => {
  it("mène une installation nue jusqu'à un état utilisable", async () => {
    // 1. Nothing on disk: the application must not pretend it can run.
    expect(await state()).toMatchObject({ required: true, blocker: "config_missing" });
    expect(existsSync(file)).toBe(false);

    // 2. The key is handed over once and never comes back.
    const saveResponse = await ipcMain.invoke(IPC_CHANNELS.credentialSave, {
      provider: "anthropic",
      secret: SECRET,
    });
    expect(JSON.stringify(saveResponse)).not.toContain(SECRET);

    // 3. The wizard now sees a credential, and says where it came from.
    const withKey = await state();
    expect(withKey.providers.find((provider) => provider.id === "anthropic")).toMatchObject({
      credentialConfigured: true,
      credentialSource: "keychain",
    });

    // 4. Finishing writes the configuration and reports a usable install.
    const done = (await ipcMain.invoke(IPC_CHANNELS.onboardingComplete, {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      profile: "auto",
      level: "standard",
    })) as OnboardingCompleteResponse;

    expect(done.state.required).toBe(false);
    expect(opened).toBe(1);

    // 5. What landed on disk is a configuration the CLI would accept as its
    //    own — same file, same schema, no desktop-specific dialect.
    const persisted = await readSavedConfig();
    expect(persisted).toMatchObject({
      defaultProvider: "anthropic",
      defaultModel: "claude-haiku-4-5",
      defaultLevel: "standard",
      defaultProfile: "auto",
    });

    // 6. And the secret is not in it.
    expect(await readFile(file, "utf8")).not.toContain(SECRET);
  });

  it("reste ouvert tant que l'installation ne peut pas fonctionner", async () => {
    const done = (await ipcMain.invoke(IPC_CHANNELS.onboardingComplete, {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      profile: "auto",
      level: "standard",
    })) as OnboardingCompleteResponse;

    // Saved, but there is still no key: closing here would drop someone on a
    // surface whose every action fails.
    expect(done.state).toMatchObject({ required: true, blocker: "credential_missing" });
    expect(opened).toBe(0);
    expect(existsSync(file)).toBe(true);
  });

  it("ne redemande rien à quelqu'un déjà configuré", async () => {
    env.ANTHROPIC_API_KEY = SECRET;
    await writeFile(
      file,
      JSON.stringify(ConfigSchema.parse({ defaultProvider: "anthropic" })),
      "utf8",
    );

    expect(await state()).toMatchObject({ required: false });
  });

  it("mène une installation locale sans aucune clé jusqu'au bout", async () => {
    // The compatible endpoint is the path someone running a local server takes:
    // no credential exists to store, and demanding one would block them.
    const done = (await ipcMain.invoke(IPC_CHANNELS.onboardingComplete, {
      provider: "openai-compatible",
      model: "local-model",
      profile: "auto",
      level: "standard",
      compatibleProvider: { id: "local", name: "Ollama", baseUrl: "http://localhost:11434/v1" },
    })) as OnboardingCompleteResponse;

    expect(done.state.required).toBe(false);
    expect((await readSavedConfig()).providers?.local).toMatchObject({
      type: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
    });
  });

  it("enregistre le profil choisi, pas seulement celui proposé", async () => {
    // The wizard offers a profile now; a choice that never reaches the file is
    // a control that does nothing.
    env.__stored = SECRET;
    await ipcMain.invoke(IPC_CHANNELS.onboardingComplete, {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      profile: "clean",
      level: "standard",
    });

    expect((await readSavedConfig()).defaultProfile).toBe("clean");
  });

  it("garde le choix de niveau que l'utilisateur a fait", async () => {
    env.__stored = SECRET;
    await ipcMain.invoke(IPC_CHANNELS.onboardingComplete, {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      profile: "auto",
      level: "complete",
    });

    expect((await readSavedConfig()).defaultLevel).toBe("complete");
  });
});

describe("validation du formulaire, côté renderer", () => {
  const provider = {
    id: "anthropic" as const,
    label: "Anthropic",
    requiresApiKey: true,
    envName: "ANTHROPIC_API_KEY",
    supportsSecureAuth: true,
    credentialConfigured: true,
    credentialSource: "keychain" as const,
    models: [{ id: "claude-haiku-4-5", name: "Haiku", description: "", recommended: true }],
  };
  const form = {
    provider: "anthropic" as const,
    model: "claude-haiku-4-5",
    profile: "auto",
    level: "standard" as const,
    compatibleId: "local",
    compatibleName: "",
    compatibleBaseUrl: "http://localhost:11434/v1",
  };

  it("accepte un formulaire complet", () => {
    expect(findOnboardingProblem(form, provider, t)).toBeUndefined();
  });

  it("dit quoi faire quand la clé manque, sans jargon", () => {
    const problem = findOnboardingProblem(form, { ...provider, credentialConfigured: false }, t);

    expect(problem).toContain("Anthropic");
    expect(problem).toContain("clé API");
  });

  it("réclame un modèle", () => {
    expect(findOnboardingProblem({ ...form, model: "  " }, provider, t)).toContain("modèle");
  });

  it("refuse une URL de base sans schéma", () => {
    // `localhost:11434` parses as a URL — with `localhost:` as its protocol —
    // and would only fail on the first request.
    const compatible = { ...provider, id: "openai-compatible" as const, requiresApiKey: false };

    expect(
      findOnboardingProblem({ ...form, compatibleBaseUrl: "localhost:11434" }, compatible, t),
    ).toContain("http://");
  });

  it("refuse un identifiant de fournisseur non normalisé", () => {
    const compatible = { ...provider, id: "openai-compatible" as const, requiresApiKey: false };

    expect(
      findOnboardingProblem({ ...form, compatibleId: "Mon Serveur" }, compatible, t),
    ).toContain("minuscules");
  });

  it("nomme la variable d'environnement où la clé a été trouvée", () => {
    // Someone who exported a key in their shell should recognise their own
    // doing rather than wonder where this came from.
    expect(describeCredentialSource({ ...provider, credentialSource: "environment" }, t)).toContain(
      "ANTHROPIC_API_KEY",
    );
  });
});

describe("ce que la fenêtre dit de la clé", () => {
  const base = {
    id: "openai-compatible" as const,
    label: "OpenAI Compatible",
    requiresApiKey: false,
    supportsSecureAuth: false,
    credentialConfigured: false,
    credentialSource: "not_configured" as const,
    models: [],
  };

  it("ne réclame pas une clé à un fournisseur qui n'en demande aucune", () => {
    // « Aucune clé enregistrée » envoie chercher une clé qui n'existe pas.
    expect(describeCredentialSource(base, t)).toContain("Aucune clé nécessaire");
  });

  it("signale bien la clé manquante quand il en faut une", () => {
    expect(
      describeCredentialSource({ ...base, id: "anthropic", requiresApiKey: true }, t),
    ).toContain("Aucune clé enregistrée");
  });
});
