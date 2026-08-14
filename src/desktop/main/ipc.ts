import process from "node:process";
import { executeReprompt } from "../../application/reprompt.js";
import { hydrateCredentials } from "../../auth/credentials.js";
import { loadConfig, saveConfig } from "../../config/loader.js";
import { ConfigSchema, type Config } from "../../config/schema.js";
import {
  getProviderEnvName,
  listCredentialProviders,
  OPENAI_COMPATIBLE_PROVIDER_ID,
} from "../../providers/catalog.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import {
  ConfigWriteRequestSchema,
  EmptyRequestSchema,
  NotImplementedIpcError,
  RepromptCancelRequestSchema,
  RepromptStartRequestSchema,
  ResultAcceptRequestSchema,
  type ProviderStatus,
  type SafeConfig,
} from "../shared/ipc-contract.js";
import { RepromptService, type RunEventSender } from "./reprompt-service.js";

/**
 * IPC handlers — registration only (DESKTOP.md §8.1). Channel names and
 * payload schemas are defined once in `desktop/shared/`; this file wires them
 * to the business engine. Every incoming message is validated by its Zod
 * schema before use: the renderer is untrusted.
 *
 * Electron-free on purpose (the real `ipcMain` and `clipboard` are injected
 * by `index.ts`) so the whole contract is unit-testable without a runtime.
 */

export interface IpcEventLike {
  readonly sender: RunEventSender;
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcEventLike, payload: unknown) => unknown): void;
}

export interface ClipboardLike {
  writeText(text: string): void;
}

export interface DesktopIpcDependencies {
  ipcMain: IpcMainLike;
  clipboard: ClipboardLike;
  service?: RepromptService;
  loadConfig?: () => Promise<Config>;
  saveConfig?: (config: Config) => Promise<void>;
  hydrateCredentials?: (env: NodeJS.ProcessEnv) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export function registerIpcHandlers(dependencies: DesktopIpcDependencies): void {
  const env = dependencies.env ?? process.env;
  const load = dependencies.loadConfig ?? loadConfig;
  const save = dependencies.saveConfig ?? saveConfig;
  const hydrate = dependencies.hydrateCredentials ?? hydrateCredentials;
  const service =
    dependencies.service ?? new RepromptService({ executeReprompt, loadConfig: load, env });
  const { ipcMain, clipboard } = dependencies;

  ipcMain.handle(IPC_CHANNELS.repromptStart, (event, payload) => {
    const request = RepromptStartRequestSchema.parse(payload);
    return service.start(request, event.sender);
  });

  ipcMain.handle(IPC_CHANNELS.repromptCancel, (_event, payload) => {
    const { runId } = RepromptCancelRequestSchema.parse(payload);
    service.cancel(runId);
  });

  ipcMain.handle(IPC_CHANNELS.captureSelection, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    // Lot 2: capture of the current selection (DESKTOP.md §5.1).
    throw new NotImplementedIpcError(IPC_CHANNELS.captureSelection);
  });

  ipcMain.handle(IPC_CHANNELS.resultAccept, (_event, payload) => {
    const { runId, mode } = ResultAcceptRequestSchema.parse(payload);
    const result = service.storedResult(runId);
    if (!result) {
      return { applied: false };
    }
    if (mode === "copy") {
      clipboard.writeText(result.rewritten);
      return { applied: true };
    }
    // "replace" needs focus restoration and keystroke injection — lot 2
    // (DESKTOP.md §5.2). Until then the capsule degrades to copy.
    return { applied: false };
  });

  ipcMain.handle(IPC_CHANNELS.configRead, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return sanitizeConfigForRenderer(await load());
  });

  ipcMain.handle(IPC_CHANNELS.configWrite, async (_event, payload) => {
    const patch = ConfigWriteRequestSchema.parse(payload);
    const current = await load();
    // The desktop surface never enables telemetry, whatever the renderer asks.
    const merged: Config = ConfigSchema.parse({ ...current, ...patch, telemetry: false });
    await save(merged);
    return sanitizeConfigForRenderer(merged);
  });

  ipcMain.handle(IPC_CHANNELS.providersStatus, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return listProviderStatuses(env, hydrate, load);
  });

  ipcMain.handle(IPC_CHANNELS.doctorRun, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    // Lot 5: reuse of the doctor use case behind a structured report.
    throw new NotImplementedIpcError(IPC_CHANNELS.doctorRun);
  });

  ipcMain.handle(IPC_CHANNELS.permissionsState, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    // Lot 2: real Accessibility/Automation probing (DESKTOP.md §5.9). Until
    // then the app reports the explicit degraded mode promised by §2.6.
    return { accessibility: false, canReplace: false, reason: "desktop.permissions_pending" };
  });

  ipcMain.handle(IPC_CHANNELS.permissionsRequest, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    // Lot 2 — and only on explicit user action, never at startup.
    throw new NotImplementedIpcError(IPC_CHANNELS.permissionsRequest);
  });
}

/**
 * The `Config` the renderer is allowed to see: custom provider headers are
 * dropped because they may carry an Authorization token. API keys never
 * appear here at all — they live in the environment and the keychain.
 */
export function sanitizeConfigForRenderer(config: Config): SafeConfig {
  const { providers, ...rest } = config;
  if (!providers) {
    return rest;
  }
  const safeProviders = Object.fromEntries(
    Object.entries(providers).map(([id, provider]) => [
      id,
      // Rebuilt field by field: `customHeaders` may carry an Authorization
      // token and never crosses the IPC.
      {
        type: provider.type,
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKeyEnv: provider.apiKeyEnv,
      },
    ]),
  );
  return { ...rest, providers: safeProviders };
}

async function listProviderStatuses(
  env: NodeJS.ProcessEnv,
  hydrate: (env: NodeJS.ProcessEnv) => Promise<void>,
  load: () => Promise<Config>,
): Promise<ProviderStatus[]> {
  // Hydration copies keychain entries into a throwaway env so the source of
  // each credential stays distinguishable. Values never leave the main.
  const hydrated = { ...env };
  await hydrate(hydrated);

  const statuses: ProviderStatus[] = listCredentialProviders().map((definition) => {
    const envName = getProviderEnvName(definition.id);
    if (env[envName]) {
      return { id: definition.id, configured: true, source: "environment" };
    }
    if (hydrated[envName]) {
      return { id: definition.id, configured: true, source: "keychain" };
    }
    return { id: definition.id, configured: false, source: "not_configured" };
  });

  const config = await load();
  const customProviders = config.providers ?? {};
  statuses.push({
    id: OPENAI_COMPATIBLE_PROVIDER_ID,
    configured: Object.keys(customProviders).length > 0,
    source: Object.keys(customProviders).length > 0 ? "config" : "not_configured",
  });
  statuses.push({ id: "mock", configured: true, source: "builtin" });
  return statuses;
}
