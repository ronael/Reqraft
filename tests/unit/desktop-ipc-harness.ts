import { vi } from "vitest";
import type { ExecuteRepromptInput, ExecuteRepromptResult } from "@/application/reprompt.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { Config } from "@/config/schema.js";
import type { RepromptResult } from "@/core/types.js";
import {
  registerIpcHandlers,
  type IpcEventLike,
  type IpcMainLike,
} from "@/apps/desktop/main/ipc.js";
import { RepromptService, type RunEventSender } from "@/apps/desktop/main/reprompt-service.js";

/**
 * Le banc d'essai du contrat IPC desktop.
 *
 * Extrait de `desktop-ipc.test.ts` quand l'acceptation d'un résultat a pris
 * assez d'importance pour vivre dans son propre fichier : le remplacement, la
 * copie et le texte repris à la main se vérifient ensemble, et le fichier
 * d'origine avait atteint sa limite de longueur. Le monter deux fois aurait
 * fait diverger deux copies du même faux `ipcMain`.
 *
 * Ce fichier n'est pas une suite : il ne porte aucun `describe`, et le motif
 * de collecte de Vitest ne le ramasse pas.
 */

export const FAKE_RESULT: RepromptResult = {
  original: "demande brute",
  rewritten: "demande reformulée",
  profile: "general",
  level: "standard",
  provider: "mock",
  model: "mock-model",
  changes: ["demande clarifiée"],
  quality: { status: "good", signals: [] },
};

export const MOCK_CONFIG: Config = { ...DEFAULT_CONFIG, defaultProvider: "mock" };

export class FakeIpcMain implements IpcMainLike {
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

export function createFakeSender(): {
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

export function streamingExecute(
  result: RepromptResult = FAKE_RESULT,
): (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult> {
  return vi.fn((input: ExecuteRepromptInput): Promise<ExecuteRepromptResult> => {
    input.onDelta?.("fragment-1 ");
    input.onDelta?.("fragment-2");
    return Promise.resolve({ result, detectedProfile: false });
  });
}

export interface Harness {
  ipcMain: FakeIpcMain;
  clipboard: { writeText: ReturnType<typeof vi.fn<(text: string) => void>> };
  execute: (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult>;
  saveConfig: ReturnType<typeof vi.fn>;
  relaunchApp: ReturnType<typeof vi.fn>;
  onShortcutsChanged: ReturnType<typeof vi.fn<(shortcuts: Config["desktopShortcuts"]) => void>>;
  sender: RunEventSender;
  sent: { channel: string; payload: unknown }[];
  state: { destroyed: boolean };
}

export function setup(options: {
  execute?: (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult>;
  config?: Config;
  env?: NodeJS.ProcessEnv;
  hydrateCredentials?: (env: NodeJS.ProcessEnv) => Promise<void>;
}): Harness {
  const config = options.config ?? MOCK_CONFIG;
  const env = options.env ?? {};
  const execute = options.execute ?? streamingExecute();
  const saveConfig = vi.fn((_config: Config) => Promise.resolve());
  const relaunchApp = vi.fn<() => void>();
  const onShortcutsChanged = vi.fn<(shortcuts: Config["desktopShortcuts"]) => void>();
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
    relaunchApp,
    onShortcutsChanged,
    hydrateCredentials: options.hydrateCredentials ?? (() => Promise.resolve()),
    env,
  });
  return {
    ipcMain,
    clipboard,
    execute,
    saveConfig,
    relaunchApp,
    onShortcutsChanged,
    sender,
    sent,
    state,
  };
}

export function sentChannels(harness: Harness, channel: string): unknown[] {
  return harness.sent.filter((event) => event.channel === channel).map((event) => event.payload);
}
