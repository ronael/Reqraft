import process from "node:process";
import { executeReprompt } from "@/application/reprompt.js";
import { hydrateCredentials } from "@/auth/credentials.js";
import { loadConfig, saveConfig } from "@/config/loader.js";
import { ConfigSchema, type Config } from "@/config/schema.js";
import {
  getProviderEnvName,
  listCredentialProviders,
  OPENAI_COMPATIBLE_PROVIDER_ID,
} from "@/providers/catalog.js";
import { IPC_CHANNELS } from "@/desktop/shared/ipc-channels.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import { listProfiles } from "@/profiles/registry.js";
import {
  ConfigWriteRequestSchema,
  EmptyRequestSchema,
  RepromptCancelRequestSchema,
  RepromptStartRequestSchema,
  ResultAcceptRequestSchema,
  type DoctorReport,
  type ProviderStatus,
  type SafeConfig,
  type ShortcutStateInfo,
} from "@/desktop/shared/ipc-contract.js";
import { RepromptService, type RunEventSender } from "./reprompt-service.js";
import { buildDoctorReport } from "./doctor.js";
import type { CaptureService } from "./capture-service.js";
import type { PermissionsReport } from "./permissions.js";

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
  /** Lot 2: capture/reinjection orchestrator. Absent in tests → degraded. */
  captureService?: CaptureService;
  /** Lot 2: permissions probe (§5.9). Absent → explicit degraded mode. */
  probePermissions?: () => Promise<PermissionsReport>;
  /** Lot 2: triggers the macOS Accessibility prompt (explicit action only). */
  requestAccessibility?: () => void;
  /** Lot 4: opens the settings window (from the popover or the capsule). */
  openSettings?: () => void;
  /** Lot 5: structured doctor report (settings Diagnostic tab). */
  runDoctorReport?: () => Promise<DoctorReport>;
  /** Lot 5: registered/rejected global shortcuts (settings Shortcuts tab). */
  shortcutState?: () => ShortcutStateInfo;
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
    // The stash was filled by the global-shortcut trigger, before the capsule
    // took the focus. Without it there is nothing to capture: free input.
    return dependencies.captureService?.consumeStashed() ?? { empty: true };
  });

  ipcMain.handle(IPC_CHANNELS.resultAccept, async (_event, payload) => {
    const { runId, mode } = ResultAcceptRequestSchema.parse(payload);
    const result = service.storedResult(runId);
    if (!result) {
      return { applied: false };
    }
    if (mode === "copy") {
      clipboard.writeText(result.rewritten);
      return { applied: true };
    }
    // "replace" reinjects into the recorded source app — never into whatever
    // is frontmost now, which would be the capsule itself (§5.2).
    if (!dependencies.captureService) {
      return { applied: false };
    }
    return await dependencies.captureService.replace(result.rewritten);
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

  ipcMain.handle(IPC_CHANNELS.doctorRun, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    if (dependencies.runDoctorReport) {
      return await dependencies.runDoctorReport();
    }
    return await buildDoctorReport({ env });
  });

  ipcMain.handle(IPC_CHANNELS.permissionsState, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    if (!dependencies.probePermissions) {
      // No probe wired (tests): the explicit degraded mode promised by §2.6.
      return { accessibility: false, canReplace: false, reason: "desktop.permissions_pending" };
    }
    const report = await dependencies.probePermissions();
    return {
      accessibility: report.accessibility,
      canReplace: report.canReplace,
      ...(report.gap === "none" ? {} : { reason: report.message }),
    };
  });

  ipcMain.handle(IPC_CHANNELS.permissionsRequest, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    // Only ever on explicit user action, never at startup (§5.9). The system
    // answer arrives asynchronously: re-probe afterwards.
    dependencies.requestAccessibility?.();
    const report = dependencies.probePermissions
      ? await dependencies.probePermissions()
      : { accessibility: false };
    return { accessibility: report.accessibility };
  });

  ipcMain.handle(IPC_CHANNELS.profilesList, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    // The renderer gets identity and wording only — instructions and the
    // detect function stay in the engine. "auto" leads: it is the default.
    return [
      { id: AUTO_PROFILE_ID, name: "Auto", description: "Détection locale du profil" },
      ...listProfiles().map((profile) => ({
        id: profile.id,
        name: profile.name,
        description: profile.description,
      })),
    ];
  });

  ipcMain.handle(IPC_CHANNELS.windowOpenSettings, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    dependencies.openSettings?.();
  });

  ipcMain.handle(IPC_CHANNELS.shortcutsState, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    // Without a wired source (tests), report the honest empty state.
    return dependencies.shortcutState?.() ?? { registered: [], rejected: [] };
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
