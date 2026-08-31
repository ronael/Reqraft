import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import {
  registerIpcHandlers,
  type IpcEventLike,
  type IpcMainLike,
} from "@/apps/desktop/main/ipc.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import {
  CURRENT_WELCOME_TOUR_VERSION,
  type OnboardingStateResponse,
  type CredentialSaveResponse,
  type OnboardingCompleteResponse,
} from "@/apps/desktop/shared/ipc-contract.js";

/**
 * The onboarding contract, exercised the way the renderer drives it.
 *
 * Two things are being guarded: that a blank machine is recognised as blank,
 * and that the secret someone types goes one way. A credential reaching a
 * response — any response — is the failure this file exists to catch.
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

const SECRET = "sk-ant-not-a-real-key-0987654321";

let ipcMain: FakeIpcMain;
let config: Config;
let saved: Config[];
let stored: { provider: string; secret: string }[];
let fileExists: boolean;
let completed: number;
let tourCompleted: number;

interface HarnessOptions {
  env?: NodeJS.ProcessEnv;
  configFileExists?: boolean;
  config?: Config;
}

function harness(options: HarnessOptions = {}): void {
  ipcMain = new FakeIpcMain();
  saved = [];
  stored = [];
  completed = 0;
  tourCompleted = 0;
  fileExists = options.configFileExists ?? false;
  config = options.config ?? { ...DEFAULT_CONFIG };

  registerIpcHandlers({
    ipcMain,
    clipboard: { writeText: vi.fn() },
    env: options.env ?? {},
    loadConfig: () => Promise.resolve(config),
    saveConfig: (next) => {
      saved.push(next);
      config = next;
      fileExists = true;
      return Promise.resolve();
    },
    // No keychain and no network in a unit test: the real service is covered
    // by the auth suite, and what matters here is that it is handed the secret
    // and that nothing else is.
    hydrateCredentials: () => Promise.resolve(),
    configFileExists: () => fileExists,
    storeCredential: (provider, secret) => {
      stored.push({ provider, secret });
      return Promise.resolve();
    },
    onOnboardingComplete: () => {
      completed += 1;
    },
    onWelcomeTourComplete: () => {
      tourCompleted += 1;
    },
  });
}

async function state(): Promise<OnboardingStateResponse> {
  return (await ipcMain.invoke(IPC_CHANNELS.onboardingState)) as OnboardingStateResponse;
}

beforeEach(() => {
  harness();
});

describe("onboarding:state", () => {
  it("reports a blank machine as needing configuration", async () => {
    expect(await state()).toMatchObject({ required: true, blocker: "config_missing" });
  });

  it("reports a configured machine as ready", async () => {
    harness({
      configFileExists: true,
      env: { ANTHROPIC_API_KEY: SECRET },
      config: { ...DEFAULT_CONFIG, defaultProvider: "anthropic" },
    });

    expect(await state()).toMatchObject({ required: false, welcomeTourRequired: true });
    expect((await state()).blocker).toBeUndefined();
  });

  it("requires the tour until its current version has been completed", async () => {
    harness({
      configFileExists: true,
      env: { ANTHROPIC_API_KEY: SECRET },
      config: {
        ...DEFAULT_CONFIG,
        defaultProvider: "anthropic",
        desktopWelcomeTourVersion: CURRENT_WELCOME_TOUR_VERSION,
      },
    });

    expect(await state()).toMatchObject({ required: false, welcomeTourRequired: false });
  });

  it("persists tour completion and closes it only on a usable installation", async () => {
    harness({
      configFileExists: true,
      env: { ANTHROPIC_API_KEY: SECRET },
      config: { ...DEFAULT_CONFIG, defaultProvider: "anthropic" },
    });

    const next = (await ipcMain.invoke(
      IPC_CHANNELS.onboardingTourComplete,
    )) as OnboardingStateResponse;

    expect(saved.at(-1)?.desktopWelcomeTourVersion).toBe(CURRENT_WELCOME_TOUR_VERSION);
    expect(next.welcomeTourRequired).toBe(false);
    expect(tourCompleted).toBe(1);
  });

  it("reports a saved configuration whose key never arrived", async () => {
    harness({
      configFileExists: true,
      config: { ...DEFAULT_CONFIG, defaultProvider: "anthropic" },
    });

    expect(await state()).toMatchObject({ required: true, blocker: "credential_missing" });
  });

  it("offers providers with their models", async () => {
    const providers = (await state()).providers;
    const anthropic = providers.find((provider) => provider.id === "anthropic");

    expect(anthropic).toMatchObject({ label: "Anthropic", requiresApiKey: true });
    expect(anthropic?.models.length).toBeGreaterThan(0);
    expect(anthropic?.models.every((model) => model.id.length > 0)).toBe(true);
  });

  it("hides the mock provider from the wizard", async () => {
    // It exists for tests; offering it as a choice would ship a fake engine.
    expect((await state()).providers.map((provider) => provider.id)).not.toContain("mock");
  });

  it("recognises a key already exported in the environment", async () => {
    harness({ env: { ANTHROPIC_API_KEY: SECRET } });
    const anthropic = (await state()).providers.find((provider) => provider.id === "anthropic");

    // Someone who set this up in their shell is told so, not asked again.
    expect(anthropic).toMatchObject({
      credentialConfigured: true,
      credentialSource: "environment",
    });
  });

  it("never carries the key it detected", async () => {
    harness({ env: { ANTHROPIC_API_KEY: SECRET } });

    expect(JSON.stringify(await state())).not.toContain(SECRET);
  });

  it("starts the form on the current configuration", async () => {
    harness({
      configFileExists: true,
      config: { ...DEFAULT_CONFIG, defaultProvider: "openai", defaultModel: "gpt-4o-mini" },
    });

    expect((await state()).suggested).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
    });
  });
});

describe("credential:save", () => {
  it("hands the secret to the credential service and nothing else", async () => {
    const response = (await ipcMain.invoke(IPC_CHANNELS.credentialSave, {
      provider: "anthropic",
      secret: SECRET,
    })) as CredentialSaveResponse;

    expect(stored).toEqual([{ provider: "anthropic", secret: SECRET }]);
    expect(JSON.stringify(response)).not.toContain(SECRET);
    expect(response.providers.some((provider) => provider.id === "anthropic")).toBe(true);
  });

  it("refuses a provider that has no storable key", async () => {
    // The compatible endpoint names its own environment variable; there is no
    // keychain entry to write, and pretending otherwise would lose the secret.
    await expect(
      ipcMain.invoke(IPC_CHANNELS.credentialSave, {
        provider: "openai-compatible",
        secret: SECRET,
      }),
    ).rejects.toThrow(/keychain/);
    expect(stored).toEqual([]);
  });

  it("refuses an empty secret", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.credentialSave, { provider: "anthropic", secret: "" }),
    ).rejects.toThrow();
    expect(stored).toEqual([]);
  });

  it("refuses an unknown provider", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.credentialSave, { provider: "acme", secret: SECRET }),
    ).rejects.toThrow();
    expect(stored).toEqual([]);
  });

  it("refuses a payload carrying extra fields", async () => {
    // Strict schemas: an unexpected field is a renderer that drifted from the
    // contract, not something to silently ignore.
    await expect(
      ipcMain.invoke(IPC_CHANNELS.credentialSave, {
        provider: "anthropic",
        secret: SECRET,
        keychain: false,
      }),
    ).rejects.toThrow();
  });
});

describe("onboarding:complete", () => {
  const request = {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    profile: "auto",
    level: "standard",
  };

  it("saves the configuration through the shared domain", async () => {
    harness({ env: { ANTHROPIC_API_KEY: SECRET } });
    const response = (await ipcMain.invoke(
      IPC_CHANNELS.onboardingComplete,
      request,
    )) as OnboardingCompleteResponse;

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      defaultProvider: "anthropic",
      defaultModel: "claude-haiku-4-5",
      defaultLevel: "standard",
    });
    expect(response.config.defaultProvider).toBe("anthropic");
  });

  it("leaves the installation usable and says so", async () => {
    harness({ env: { ANTHROPIC_API_KEY: SECRET } });
    const response = (await ipcMain.invoke(
      IPC_CHANNELS.onboardingComplete,
      request,
    )) as OnboardingCompleteResponse;

    expect(response.state.required).toBe(false);
    expect(completed).toBe(1);
  });

  it("keeps the wizard open when the key never arrived", async () => {
    // Saving a provider whose credential is still missing is a configuration
    // that cannot run. Closing here would drop the user on a dead surface.
    const response = (await ipcMain.invoke(
      IPC_CHANNELS.onboardingComplete,
      request,
    )) as OnboardingCompleteResponse;

    expect(response.state).toMatchObject({ required: true, blocker: "credential_missing" });
    expect(completed).toBe(0);
  });

  it("refuses a provider that cannot be chosen", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.onboardingComplete, { ...request, provider: "mock" }),
    ).rejects.toThrow(/cannot be chosen/);
    expect(saved).toEqual([]);
  });

  it("refuses an empty model", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.onboardingComplete, { ...request, model: "   " }),
    ).rejects.toThrow();
    expect(saved).toEqual([]);
  });

  it("refuses a compatible endpoint whose URL is not one", async () => {
    await expect(
      ipcMain.invoke(IPC_CHANNELS.onboardingComplete, {
        ...request,
        provider: "openai-compatible",
        compatibleProvider: { id: "local", baseUrl: "localhost:11434" },
      }),
    ).rejects.toThrow(/URL/);
    expect(saved).toEqual([]);
  });

  it("records a declared compatible endpoint and becomes usable", async () => {
    const response = (await ipcMain.invoke(IPC_CHANNELS.onboardingComplete, {
      ...request,
      provider: "openai-compatible",
      model: "local-model",
      compatibleProvider: { id: "local", name: "Ollama", baseUrl: "http://localhost:11434/v1" },
    })) as OnboardingCompleteResponse;

    expect(saved[0]?.providers?.local).toMatchObject({ baseUrl: "http://localhost:11434/v1" });
    expect(response.state.required).toBe(false);
  });

  it("preserves settings the wizard never asks about", async () => {
    // Onboarding is not a reset: someone who already tuned the timeout keeps
    // it. This is why the shared builder takes the existing configuration.
    harness({
      configFileExists: true,
      env: { ANTHROPIC_API_KEY: SECRET },
      config: { ...DEFAULT_CONFIG, timeoutMs: 90_000, showStats: true },
    });

    await ipcMain.invoke(IPC_CHANNELS.onboardingComplete, request);

    expect(saved[0]).toMatchObject({ timeoutMs: 90_000, showStats: true });
  });

  it("never carries a credential in its answer", async () => {
    harness({ env: { ANTHROPIC_API_KEY: SECRET } });
    const response = await ipcMain.invoke(IPC_CHANNELS.onboardingComplete, request);

    expect(JSON.stringify(response)).not.toContain(SECRET);
  });
});
