import { describe, expect, it, vi } from "vitest";
import type { ExecuteRepromptInput, ExecuteRepromptResult } from "@/application/reprompt.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import { REPROMPT_LEVELS } from "@/core/levels.js";
import type { RepromptResult } from "@/core/types.js";
import {
  registerIpcHandlers,
  sanitizeConfigForRenderer,
  type IpcEventLike,
  type IpcMainLike,
} from "@/apps/desktop/main/ipc.js";
import { RepromptService, type RunEventSender } from "@/apps/desktop/main/reprompt-service.js";
import {
  IPC_CHANNELS,
  PUSH_CHANNELS,
  REQUEST_CHANNELS,
} from "@/apps/desktop/shared/ipc-channels.js";
import {
  REPROMPT_LEVEL_IDS,
  type RepromptStartResponse,
} from "@/apps/desktop/shared/ipc-contract.js";

const FAKE_RESULT: RepromptResult = {
  original: "demande brute",
  rewritten: "demande reformulée",
  profile: "general",
  level: "standard",
  provider: "mock",
  model: "mock-model",
  changes: ["demande clarifiée"],
  quality: { status: "good", signals: [] },
};

const MOCK_CONFIG: Config = { ...DEFAULT_CONFIG, defaultProvider: "mock" };

class FakeIpcMain implements IpcMainLike {
  private readonly handlers = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();

  handle(channel: string, listener: (event: IpcEventLike, payload: unknown) => unknown): void {
    this.handlers.set(channel, listener);
  }

  registeredChannels(): string[] {
    return [...this.handlers.keys()];
  }

  invoke(channel: string, payload: unknown, sender: RunEventSender): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      return Promise.reject(new Error(`Aucun handler pour ${channel}`));
    }
    // Like the real ipcMain: a handler that throws synchronously surfaces as
    // a rejected promise to the renderer, never as a synchronous throw.
    try {
      return Promise.resolve(handler({ sender }, payload));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function createFakeSender(): {
  sender: RunEventSender;
  sent: { channel: string; payload: unknown }[];
  state: { destroyed: boolean };
} {
  const sent: { channel: string; payload: unknown }[] = [];
  const state = { destroyed: false };
  const sender: RunEventSender = {
    send: (channel, payload) => {
      sent.push({ channel, payload });
    },
    isDestroyed: () => state.destroyed,
  };
  return { sender, sent, state };
}

function streamingExecute(
  result: RepromptResult = FAKE_RESULT,
): (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult> {
  return vi.fn((input: ExecuteRepromptInput): Promise<ExecuteRepromptResult> => {
    input.onDelta?.("fragment-1 ");
    input.onDelta?.("fragment-2");
    return Promise.resolve({ result, detectedProfile: false });
  });
}

interface Harness {
  ipcMain: FakeIpcMain;
  clipboard: { writeText: ReturnType<typeof vi.fn<(text: string) => void>> };
  execute: (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult>;
  saveConfig: ReturnType<typeof vi.fn>;
  sender: RunEventSender;
  sent: { channel: string; payload: unknown }[];
  state: { destroyed: boolean };
}

function setup(options: {
  execute?: (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult>;
  config?: Config;
  env?: NodeJS.ProcessEnv;
  hydrateCredentials?: (env: NodeJS.ProcessEnv) => Promise<void>;
}): Harness {
  const config = options.config ?? MOCK_CONFIG;
  const env = options.env ?? {};
  const execute = options.execute ?? streamingExecute();
  const saveConfig = vi.fn((_config: Config) => Promise.resolve());
  const { sender, sent, state } = createFakeSender();

  const service = new RepromptService({
    executeReprompt: execute,
    loadConfig: () => Promise.resolve(config),
    env,
    createRunId: () => "run-1",
  });

  const ipcMain = new FakeIpcMain();
  const clipboard = { writeText: vi.fn<(text: string) => void>() };
  registerIpcHandlers({
    ipcMain,
    clipboard,
    service,
    loadConfig: () => Promise.resolve(config),
    saveConfig,
    hydrateCredentials: options.hydrateCredentials ?? (() => Promise.resolve()),
    env,
  });
  return { ipcMain, clipboard, execute, saveConfig, sender, sent, state };
}

function sentChannels(harness: Harness, channel: string): unknown[] {
  return harness.sent.filter((event) => event.channel === channel).map((event) => event.payload);
}

describe("contrat IPC desktop (DESKTOP.md §8.1)", () => {
  it("définit les canaux exacts du contrat, en un seul endroit", () => {
    expect(IPC_CHANNELS).toEqual({
      repromptStart: "reprompt:start",
      repromptCancel: "reprompt:cancel",
      captureSelection: "capture:selection",
      resultAccept: "result:accept",
      configRead: "config:read",
      configWrite: "config:write",
      providersStatus: "providers:status",
      doctorRun: "doctor:run",
      permissionsState: "permissions:state",
      permissionsRequest: "permissions:request",
      profilesList: "profiles:list",
      profilesCatalog: "profiles:catalog",
      profileRead: "profiles:read",
      profileSave: "profiles:save",
      profileDuplicate: "profiles:duplicate",
      profileDelete: "profiles:delete",
      profileExport: "profiles:export",
      windowOpenSettings: "window:open-settings",
      shortcutsState: "shortcuts:state",
      runDelta: "run:delta",
      runDone: "run:done",
      runError: "run:error",
      runCancelled: "run:cancelled",
      capsuleOpened: "capsule:opened",
    });
    expect(REQUEST_CHANNELS).toHaveLength(19);
    expect(PUSH_CHANNELS).toHaveLength(5);
  });

  it("les niveaux du contrat renderer ne dérivent pas du cœur", () => {
    expect([...REPROMPT_LEVEL_IDS]).toEqual([...REPROMPT_LEVELS]);
  });

  it("enregistre un handler pour chaque canal requête du contrat", () => {
    const harness = setup({});
    for (const channel of REQUEST_CHANNELS) {
      expect(harness.ipcMain.registeredChannels()).toContain(channel);
    }
  });
});

describe("validation Zod des messages entrants", () => {
  it("rejette un reprompt:start sans input", async () => {
    const harness = setup({});
    await expect(
      harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, {}, harness.sender),
    ).rejects.toThrow();
    await expect(
      harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: 42 }, harness.sender),
    ).rejects.toThrow();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("rejette un result:accept avec un mode inconnu", async () => {
    const harness = setup({});
    await expect(
      harness.ipcMain.invoke(
        IPC_CHANNELS.resultAccept,
        { runId: "run-1", mode: "inject" },
        harness.sender,
      ),
    ).rejects.toThrow();
  });

  it("rejette tout payload sur les canaux déclarés void", async () => {
    const harness = setup({});
    await expect(
      harness.ipcMain.invoke(IPC_CHANNELS.configRead, { unexpected: true }, harness.sender),
    ).rejects.toThrow();
  });
});

describe("cycle de vie reprompt via IPC", () => {
  it("achemine start → deltas → done avec le même runId", async () => {
    const harness = setup({});
    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.repromptStart,
      { input: "demande brute" },
      harness.sender,
    )) as RepromptStartResponse;
    expect(response.runId).toBe("run-1");
    expect(response.requestedProfile).toBe("auto");

    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });

    const deltas = sentChannels(harness, IPC_CHANNELS.runDelta) as {
      runId: string;
      chunk: string;
    }[];
    expect(deltas.map((delta) => delta.chunk)).toEqual(["fragment-1 ", "fragment-2"]);
    for (const delta of deltas) {
      expect(delta.runId).toBe("run-1");
    }
    const done = sentChannels(harness, IPC_CHANNELS.runDone)[0] as {
      runId: string;
      result: RepromptResult;
    };
    expect(done.runId).toBe("run-1");
    expect(done.result.rewritten).toBe("demande reformulée");
  });

  it("décode l'enveloppe provider : le renderer ne reçoit que du texte affichable", async () => {
    const execute = vi.fn((input: ExecuteRepromptInput): Promise<ExecuteRepromptResult> => {
      input.onDelta?.('{"rewritten":"Bon');
      input.onDelta?.("jour,");
      input.onDelta?.(' voilà."}');
      return Promise.resolve({ result: FAKE_RESULT, detectedProfile: false });
    });
    const harness = setup({ execute });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);

    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });

    const deltas = sentChannels(harness, IPC_CHANNELS.runDelta) as { chunk: string }[];
    expect(deltas.map((delta) => delta.chunk).join("")).toBe("Bonjour, voilà.");
    for (const delta of deltas) {
      expect(delta.chunk).not.toContain('"rewritten"');
    }
  });

  it("émet run:cancelled quand le run est interrompu", async () => {
    const execute = vi.fn(
      (input: ExecuteRepromptInput): Promise<ExecuteRepromptResult> =>
        new Promise((_resolve, reject) => {
          // The abort may already have fired when the engine starts: a run
          // cancelled before its first await must still settle.
          if (input.signal?.aborted) {
            reject(new Error("interrompu"));
            return;
          }
          input.signal?.addEventListener("abort", () => {
            reject(new Error("interrompu"));
          });
        }),
    );
    const harness = setup({ execute });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await vi.waitFor(() => {
      expect(execute).toHaveBeenCalled();
    });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptCancel, { runId: "run-1" }, harness.sender);

    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runCancelled)).toEqual([{ runId: "run-1" }]);
    });
    expect(sentChannels(harness, IPC_CHANNELS.runError)).toHaveLength(0);
  });

  it("émet run:error avec une UiError quand le moteur échoue", async () => {
    const execute = vi.fn((_input: ExecuteRepromptInput): Promise<ExecuteRepromptResult> => {
      return Promise.reject(new Error("réseau KO"));
    });
    const harness = setup({ execute });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);

    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runError)).toHaveLength(1);
    });
    const payload = sentChannels(harness, IPC_CHANNELS.runError)[0] as {
      runId: string;
      error: { title: string; message: string };
    };
    expect(payload.runId).toBe("run-1");
    expect(payload.error.title.length).toBeGreaterThan(0);
    expect(payload.error.message.length).toBeGreaterThan(0);
  });

  it("bloque les secrets avant tout appel provider, comme le CLI", async () => {
    const harness = setup({});
    await harness.ipcMain.invoke(
      IPC_CHANNELS.repromptStart,
      { input: "voici ma clé AKIAIOSFODNN7EXAMPLE à utiliser" },
      harness.sender,
    );

    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runError)).toHaveLength(1);
    });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("n'émet plus rien quand la fenêtre est détruite (§5.6)", async () => {
    const harness = setup({});
    harness.state.destroyed = true;
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(harness.sent).toHaveLength(0);
  });
});

describe("result:accept", () => {
  async function finishRun(harness: Harness): Promise<void> {
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });
  }

  it("mode copy : écrit le résultat dans le presse-papiers", async () => {
    const harness = setup({});
    await finishRun(harness);
    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "copy" },
      harness.sender,
    )) as { applied: boolean };
    expect(response).toEqual({ applied: true });
    expect(harness.clipboard.writeText).toHaveBeenCalledWith("demande reformulée");
  });

  it("mode replace : dégradé explicite tant que le lot 2 n'est pas livré", async () => {
    const harness = setup({});
    await finishRun(harness);
    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "replace" },
      harness.sender,
    )) as { applied: boolean };
    expect(response).toEqual({ applied: false });
    expect(harness.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("runId inconnu : applied false, sans erreur", async () => {
    const harness = setup({});
    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "inconnu", mode: "copy" },
      harness.sender,
    )) as { applied: boolean };
    expect(response).toEqual({ applied: false });
  });
});

describe("config via IPC", () => {
  it("config:read ne laisse jamais passer les en-têtes personnalisés", async () => {
    const config: Config = {
      ...MOCK_CONFIG,
      providers: {
        perso: {
          type: "openai-compatible",
          baseUrl: "https://llm.example.com",
          customHeaders: { Authorization: "Bearer secret-token" },
        },
      },
    };
    const harness = setup({ config });
    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.configRead,
      undefined,
      harness.sender,
    );
    expect(JSON.stringify(response)).not.toContain("secret-token");
    expect(JSON.stringify(response)).not.toContain("customHeaders");
    expect(JSON.stringify(response)).toContain("https://llm.example.com");
  });

  it("config:write fusionne le patch et force telemetry à false", async () => {
    const harness = setup({});
    const response = (await harness.ipcMain.invoke(
      IPC_CHANNELS.configWrite,
      { stream: false, telemetry: true },
      harness.sender,
    )) as Config;
    expect(harness.saveConfig).toHaveBeenCalledOnce();
    const saved = harness.saveConfig.mock.calls[0]?.[0] as Config;
    expect(saved.stream).toBe(false);
    expect(saved.telemetry).toBe(false);
    expect(response.stream).toBe(false);
    expect(response.telemetry).toBe(false);
  });

  it("sanitizeConfigForRenderer conserve une config sans providers custom", () => {
    expect(sanitizeConfigForRenderer(MOCK_CONFIG)).toEqual(MOCK_CONFIG);
  });
});

describe("providers:status", () => {
  it("distingue environnement, trousseau et non configuré — jamais de valeur", async () => {
    const env: NodeJS.ProcessEnv = { OPENAI_API_KEY: "sk-never-leaks" };
    const hydrateCredentials = vi.fn((target: NodeJS.ProcessEnv): Promise<void> => {
      target.ANTHROPIC_API_KEY = "sk-ant-never-leaks";
      return Promise.resolve();
    });
    const harness = setup({ env, hydrateCredentials });
    const statuses = (await harness.ipcMain.invoke(
      IPC_CHANNELS.providersStatus,
      undefined,
      harness.sender,
    )) as { id: string; configured: boolean; source: string }[];

    const byId = new Map(statuses.map((status) => [status.id, status]));
    expect(byId.get("openai")).toEqual({ id: "openai", configured: true, source: "environment" });
    expect(byId.get("anthropic")).toEqual({
      id: "anthropic",
      configured: true,
      source: "keychain",
    });
    expect(byId.get("deepseek")).toEqual({
      id: "deepseek",
      configured: false,
      source: "not_configured",
    });
    expect(byId.get("mock")).toEqual({ id: "mock", configured: true, source: "builtin" });
    expect(JSON.stringify(statuses)).not.toContain("never-leaks");
  });
});

describe("canaux capture et permissions (lot 2)", () => {
  it("capture:selection sans trigger préalable ouvre la saisie libre", async () => {
    const harness = setup({});
    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.captureSelection,
      undefined,
      harness.sender,
    );
    expect(response).toEqual({ empty: true });
  });

  it("capture:selection relaie le stash du service quand il existe", async () => {
    const captureService = {
      consumeStashed: () => ({ text: "sélection", sourceApp: "TextEdit" }),
      replace: () => Promise.resolve({ applied: true }),
    };
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      captureService: captureService as never,
    });
    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.captureSelection,
      undefined,
      harness.sender,
    );
    expect(response).toEqual({ text: "sélection", sourceApp: "TextEdit" });
  });

  it("permissions:state relaie le rapport de la sonde, avec la raison du manque", async () => {
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      probePermissions: () =>
        Promise.resolve({
          accessibility: true,
          automation: false,
          canReplace: false,
          gap: "automation",
          message: "Accessibilité accordée, Automatisation refusée.",
        }),
    });
    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.permissionsState,
      undefined,
      harness.sender,
    );
    expect(response).toEqual({
      accessibility: true,
      canReplace: false,
      reason: "Accessibilité accordée, Automatisation refusée.",
    });
  });

  it("permissions:request déclenche la demande puis re-sonde", async () => {
    const requestAccessibility = vi.fn();
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      requestAccessibility,
      probePermissions: () =>
        Promise.resolve({
          accessibility: true,
          automation: true,
          canReplace: true,
          gap: "none",
          message: "Accessibilité et Automatisation accordées.",
        }),
    });
    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.permissionsRequest,
      undefined,
      harness.sender,
    );
    expect(requestAccessibility).toHaveBeenCalledOnce();
    expect(response).toEqual({ accessibility: true });
  });

  it("result:accept replace délègue au service de capture", async () => {
    const replace = vi.fn(() => Promise.resolve({ applied: true }));
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      service: new RepromptService({
        executeReprompt: streamingExecute(),
        loadConfig: () => Promise.resolve(MOCK_CONFIG),
        env: {},
        createRunId: () => "run-1",
      }),
      captureService: {
        consumeStashed: () => ({ empty: true }),
        replace,
      } as never,
    });
    await harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, { input: "demande" }, harness.sender);
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });

    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.resultAccept,
      { runId: "run-1", mode: "replace" },
      harness.sender,
    );
    expect(response).toEqual({ applied: true });
    expect(replace).toHaveBeenCalledWith("demande reformulée");
  });

  it("permissions sans sonde câblée : mode dégradé explicite (§2.6)", async () => {
    const harness = setup({});
    const state = await harness.ipcMain.invoke(
      IPC_CHANNELS.permissionsState,
      undefined,
      harness.sender,
    );
    expect(state).toEqual({
      accessibility: false,
      canReplace: false,
      reason: "desktop.permissions_pending",
    });
    const request = await harness.ipcMain.invoke(
      IPC_CHANNELS.permissionsRequest,
      undefined,
      harness.sender,
    );
    expect(request).toEqual({ accessibility: false });
  });

  it("doctor:run renvoie le rapport structuré injecté", async () => {
    const harness = setup({});
    const report = { checks: [{ id: "provider:mock", ok: true }] };
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      runDoctorReport: () => Promise.resolve(report),
    });

    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.doctorRun,
      undefined,
      harness.sender,
    );
    expect(response).toEqual(report);
  });

  it("shortcuts:state relaie la résolution des raccourcis (§5.5)", async () => {
    const harness = setup({});
    const resolution = {
      registered: [{ accelerator: "Alt+Space", label: "⌥Espace", intent: "capture" as const }],
      rejected: ["Alt+Shift+Space"],
    };
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      shortcutState: () => resolution,
    });

    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.shortcutsState,
      undefined,
      harness.sender,
    );
    expect(response).toEqual(resolution);
  });

  it("shortcuts:state sans source câblée annonce un état vide honnête", async () => {
    const harness = setup({});
    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.shortcutsState,
      undefined,
      harness.sender,
    );
    expect(response).toEqual({ registered: [], rejected: [] });
  });
});

describe("profiles:list et window:open-settings (lot 4)", () => {
  it("profiles:list expose identité et libellés, jamais les instructions", async () => {
    const harness = setup({});
    const profiles = (await harness.ipcMain.invoke(
      IPC_CHANNELS.profilesList,
      undefined,
      harness.sender,
    )) as { id: string; name: string; description: string }[];

    expect(profiles.length).toBeGreaterThan(1);
    expect(profiles[0]).toMatchObject({ id: "auto" });
    for (const profile of profiles) {
      expect(Object.keys(profile).sort((a, b) => a.localeCompare(b))).toEqual([
        "description",
        "id",
        "name",
      ]);
    }
    expect(JSON.stringify(profiles)).not.toContain("instructions");
  });

  it("window:open-settings appelle le callback injecté, sans réponse", async () => {
    const openSettings = vi.fn();
    const harness = setup({});
    registerIpcHandlers({
      ipcMain: harness.ipcMain,
      clipboard: harness.clipboard,
      openSettings,
    });

    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.windowOpenSettings,
      undefined,
      harness.sender,
    );
    expect(openSettings).toHaveBeenCalledOnce();
    expect(response).toBeUndefined();
  });

  it("window:open-settings sans fenêtre câblée reste un no-op propre", async () => {
    const harness = setup({});
    const response = await harness.ipcMain.invoke(
      IPC_CHANNELS.windowOpenSettings,
      undefined,
      harness.sender,
    );
    expect(response).toBeUndefined();
  });
});

/**
 * `auto` is decided by the model inside the generation call, so the desktop
 * must not pretend to know the applied profile before the result exists.
 * These tests pin that boundary: `auto` in, `auto` reported at start, and the
 * applied profile read only from `RepromptResult.profile`.
 */
describe("profil auto : détection côté modèle", () => {
  function startWith(profileId?: string): {
    harness: Harness;
    started: Promise<unknown>;
  } {
    const harness = setup({});
    const payload =
      profileId === undefined ? { input: "demande" } : { input: "demande", profileId };
    return {
      harness,
      started: harness.ipcMain.invoke(IPC_CHANNELS.repromptStart, payload, harness.sender),
    };
  }

  it("transmet le sentinel auto au moteur, sans le résoudre localement", async () => {
    const { harness, started } = startWith("auto");
    const response = (await started) as RepromptStartResponse;

    expect(response.requestedProfile).toBe("auto");
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });
    expect(harness.execute).toHaveBeenCalledWith(expect.objectContaining({ profileId: "auto" }));
  });

  it("ne prétend jamais connaître un profil appliqué au démarrage", async () => {
    const { started } = startWith("auto");
    const response = (await started) as RepromptStartResponse & { profile?: unknown };

    // The old contract leaked a locally-resolved id here; nothing must fill
    // that slot again, or the capsule would display a guess as a fact.
    expect(response.profile).toBeUndefined();
    expect(Object.keys(response).sort((a, b) => a.localeCompare(b))).toEqual([
      "requestedProfile",
      "runId",
    ]);
  });

  it("le profil réellement appliqué ne vient que du résultat", async () => {
    const applied: RepromptResult = { ...FAKE_RESULT, profile: "frontend" };
    const harness = setup({ execute: streamingExecute(applied) });
    await harness.ipcMain.invoke(
      IPC_CHANNELS.repromptStart,
      { input: "demande", profileId: "auto" },
      harness.sender,
    );

    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });
    const done = sentChannels(harness, IPC_CHANNELS.runDone)[0] as { result: RepromptResult };
    expect(done.result.profile).toBe("frontend");
  });

  it("reste fonctionnel quand la détection retombe sur clean", async () => {
    const fellBack: RepromptResult = {
      ...FAKE_RESULT,
      profile: "clean",
      quality: {
        status: "good",
        signals: [{ code: "profile_detection_fallback", severity: "info" }],
      },
    };
    const harness = setup({ execute: streamingExecute(fellBack) });
    await harness.ipcMain.invoke(
      IPC_CHANNELS.repromptStart,
      { input: "demande", profileId: "auto" },
      harness.sender,
    );

    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });
    const done = sentChannels(harness, IPC_CHANNELS.runDone)[0] as { result: RepromptResult };
    expect(done.result.profile).toBe("clean");
    // The signal rides the existing quality channel: no parallel desktop path.
    expect(done.result.quality.signals).toContainEqual({
      code: "profile_detection_fallback",
      severity: "info",
    });
    expect(sentChannels(harness, IPC_CHANNELS.runError)).toHaveLength(0);
  });

  it("garde un profil explicite connu dès le démarrage", async () => {
    const { harness, started } = startWith("frontend");
    const response = (await started) as RepromptStartResponse;

    expect(response.requestedProfile).toBe("frontend");
    await vi.waitFor(() => {
      expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(1);
    });
    expect(harness.execute).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "frontend" }),
    );
  });

  it("rejette un profil inconnu au démarrage plutôt qu'en cours de run", async () => {
    const { harness, started } = startWith("nexistepas");
    await expect(started).rejects.toThrow();
    expect(sentChannels(harness, IPC_CHANNELS.runDone)).toHaveLength(0);
  });
});
