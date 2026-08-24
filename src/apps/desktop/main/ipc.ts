import process from "node:process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { executeReprompt } from "@/application/reprompt.js";
import { hydrateCredentials, login, logout } from "@/auth/credentials.js";
import { configPath, loadConfig, saveConfig, DEFAULT_CONFIG } from "@/config/loader.js";
import { createInitConfig, evaluateSetupState } from "@/config/setup.js";
import { getFallbackModelForProvider, getPresetModels } from "@/models/presets.js";
import { ConfigSchema, type Config } from "@/config/schema.js";
import {
  getProviderDefinition,
  getProviderEnvName,
  isCredentialProvider,
  listCredentialProviders,
  listProviderDefinitions,
  DEFAULT_PROVIDER_ID,
  OPENAI_COMPATIBLE_PROVIDER_ID,
  type CredentialProvider,
  type InitProvider,
} from "@/providers/catalog.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import { listProfiles } from "@/profiles/registry.js";
import { getProfileOrigin, loadProfileCatalog } from "@/profiles/catalog.js";
import { CUSTOM_PROFILE_SCHEMA_VERSION, type CustomProfile } from "@/profiles/custom.js";
import {
  PROFILE_FILE_EXTENSION,
  createLocalProfile,
  deleteLocalProfile,
  readLocalProfile,
  updateLocalProfile,
} from "@/profiles/local-store.js";
import { duplicateProfile, exportProfile } from "@/profiles/transfer.js";
import {
  ConfigWriteRequestSchema,
  CredentialDeleteRequestSchema,
  CredentialSaveRequestSchema,
  EmptyRequestSchema,
  OnboardingCompleteRequestSchema,
  ProviderDeleteRequestSchema,
  ProviderSaveRequestSchema,
  ProfileDuplicateRequestSchema,
  ProfileExportRequestSchema,
  ProfileIdRequestSchema,
  ProfileSaveRequestSchema,
  RepromptCancelRequestSchema,
  RepromptStartRequestSchema,
  ResultAcceptRequestSchema,
  type DoctorReport,
  type ProfileCatalogResponse,
  type ProfileDetail,
  type OnboardingStateResponse,
  type ProviderModelOption,
  type ProviderStatus,
  type SafeConfig,
  type ShortcutStateInfo,
} from "@/apps/desktop/shared/ipc-contract.js";
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
  /**
   * Native save dialog for a profile export. Injected so the contract stays
   * testable without Electron, and returns `undefined` when dismissed.
   */
  showSaveDialog?: (defaultFileName: string) => Promise<string | undefined>;
  /** Writes the exported document. Injected for the same reason. */
  writeExport?: (path: string, contents: string) => Promise<void>;
  /** Overridden by tests so nothing touches the real profiles directory. */
  profilesDir?: string;
  /**
   * Whether the configuration file exists.
   *
   * Its own dependency because it is the one fact `loadConfig` cannot report:
   * every field has a default, so a missing file still parses into a valid
   * object. Injected so tests can describe a blank machine.
   */
  configFileExists?: () => boolean;
  /**
   * Stores a provider credential. Defaults to the shared `auth` service, which
   * validates the key against the provider before writing it to the keychain.
   */
  storeCredential?: (
    provider: CredentialProvider,
    secret: string,
    env: NodeJS.ProcessEnv,
  ) => Promise<void>;
  /** Called once onboarding leaves the installation in a usable state. */
  onOnboardingComplete?: () => void;
  /** Removes a provider credential. Defaults to the shared `auth` service. */
  removeCredential?: (provider: CredentialProvider) => Promise<void>;
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

  const configExists = dependencies.configFileExists ?? (() => existsSync(configPath()));
  const storeCredential = dependencies.storeCredential ?? defaultStoreCredential;
  const removeCredential = dependencies.removeCredential ?? defaultRemoveCredential;
  const onboardingState = (): Promise<OnboardingStateResponse> =>
    buildOnboardingState(env, hydrate, load, configExists);

  ipcMain.handle(IPC_CHANNELS.onboardingState, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return await onboardingState();
  });

  ipcMain.handle(IPC_CHANNELS.credentialSave, async (_event, payload) => {
    const request = CredentialSaveRequestSchema.parse(payload);
    if (!isCredentialProvider(request.provider)) {
      throw new Error(
        `Le fournisseur ${request.provider} ne prend pas de clé enregistrable dans le trousseau.`,
      );
    }
    // The secret stops here. `login` checks it is not a placeholder, calls the
    // provider to confirm it works, then writes it to the OS keychain — the
    // same path `rp auth login` takes, not a second implementation of it.
    await storeCredential(request.provider, request.secret, env);
    return { providers: await listProviderStatuses(env, hydrate, load) };
  });

  registerProviderManagementHandlers({
    ipcMain,
    env,
    load,
    save,
    hydrate,
    removeCredential,
  });

  ipcMain.handle(IPC_CHANNELS.onboardingComplete, async (_event, payload) => {
    const request = OnboardingCompleteRequestSchema.parse(payload);
    if (!getProviderDefinition(request.provider).visibleInInit) {
      throw new Error(
        `Le fournisseur ${request.provider} ne peut pas être choisi à la configuration.`,
      );
    }

    // Built by the shared domain, so the file the desktop writes is the file
    // `rp init` would have written — one configuration, two front ends.
    const existing = configExists() ? await load() : undefined;
    const config = createInitConfig({
      provider: request.provider as InitProvider,
      model: request.model,
      profile: request.profile,
      level: request.level,
      copyAfterGeneration: existing?.copyAfterGeneration ?? DEFAULT_CONFIG.copyAfterGeneration,
      stream: existing?.stream ?? DEFAULT_CONFIG.stream,
      timeoutMs: existing?.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
      compatibleProvider: request.compatibleProvider,
      existing,
    });
    await save(config);

    // Recomputed from what was actually saved: a provider chosen without its
    // key leaves the installation unusable, and the wizard has to keep the
    // user rather than close on a success it did not achieve.
    const state = await onboardingState();
    if (!state.required) {
      dependencies.onOnboardingComplete?.();
    }
    return { config: sanitizeConfigForRenderer(config), state };
  });

  ipcMain.handle(IPC_CHANNELS.doctorRun, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    if (dependencies.runDoctorReport) {
      return await dependencies.runDoctorReport();
    }
    const permissions = dependencies.probePermissions
      ? await dependencies.probePermissions()
      : undefined;
    const shortcuts = dependencies.shortcutState?.();
    return await buildDoctorReport({ env, permissions, shortcuts });
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

  registerProfileIpcHandlers(dependencies, load);

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
 * Settings → Profils.
 *
 * Every operation delegates to `src/profiles/`: no validation and no write
 * rule is restated here, and the renderer never sees a path or a file.
 */
function registerProfileIpcHandlers(
  dependencies: DesktopIpcDependencies,
  load: () => Promise<Config>,
): void {
  const { ipcMain } = dependencies;
  const profilesDir = dependencies.profilesDir;

  async function readCatalog(): Promise<ProfileCatalogResponse> {
    const catalog = await loadProfileCatalog({ profilesDir });
    return {
      entries: [
        {
          id: AUTO_PROFILE_ID,
          name: "Auto",
          description: "Reqraft laisse le modèle choisir le profil adapté au texte.",
          origin: "auto" as const,
        },
        ...catalog.builtin.map((profile) => ({
          id: profile.id,
          name: profile.name,
          description: profile.description,
          origin: "builtin" as const,
          defaultLevel: profile.defaultLevel,
        })),
        ...catalog.local.map((profile) => ({
          id: profile.id,
          name: profile.name,
          description: profile.description,
          origin: "local" as const,
          defaultLevel: profile.defaultLevel,
        })),
      ],
      problems: catalog.problems.map((problem) => ({
        id: problem.id,
        path: problem.path,
        detail: problem.detail,
      })),
    };
  }

  /** Refuses anything that is not a local profile, with the reason. */
  function assertLocal(id: string): void {
    if (getProfileOrigin(id) === "builtin") {
      throw new Error(
        `« ${id} » est un profil intégré : il n'est ni modifiable ni supprimable. Dupliquez-le pour en obtenir une copie.`,
      );
    }
  }

  ipcMain.handle(IPC_CHANNELS.profilesCatalog, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return readCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.profileRead, async (_event, payload) => {
    const { id } = ProfileIdRequestSchema.parse(payload);
    await loadProfileCatalog({ profilesDir });
    assertLocal(id);
    const stored = await readLocalProfile(id, profilesDir);
    // The whole file, this time: an explicit edit is the one case where the
    // instructions have a reason to cross the bridge.
    const detail: ProfileDetail = {
      id: stored.id,
      name: stored.name,
      description: stored.description,
      ...(stored.extends === undefined ? {} : { extends: stored.extends }),
      defaultLevel: stored.defaultLevel,
      instructions: stored.instructions,
    };
    return detail;
  });

  ipcMain.handle(IPC_CHANNELS.profileSave, async (_event, payload) => {
    const request = ProfileSaveRequestSchema.parse(payload);
    await loadProfileCatalog({ profilesDir });

    const profile = {
      schemaVersion: CUSTOM_PROFILE_SCHEMA_VERSION,
      ...request.profile,
    } as CustomProfile;

    if (request.mode === "update") {
      assertLocal(profile.id);
      await updateLocalProfile(profile, { profilesDir });
    } else {
      // `createLocalProfile` refuses an id already taken, including against a
      // concurrent creation; the schema refuses a built-in id outright.
      await createLocalProfile(profile, { profilesDir });
    }

    return { catalog: await readCatalog() };
  });

  ipcMain.handle(IPC_CHANNELS.profileDuplicate, async (_event, payload) => {
    const request = ProfileDuplicateRequestSchema.parse(payload);
    await loadProfileCatalog({ profilesDir });
    await duplicateProfile(request.sourceId, request.targetId, {
      profilesDir,
      ...(request.name === undefined ? {} : { name: request.name }),
    });
    return { catalog: await readCatalog() };
  });

  ipcMain.handle(IPC_CHANNELS.profileDelete, async (_event, payload) => {
    const { id } = ProfileIdRequestSchema.parse(payload);
    await loadProfileCatalog({ profilesDir });
    assertLocal(id);

    // A configuration left pointing at a deleted profile turns every later run
    // into an unknown-profile failure.
    const config = await load();
    if (config.defaultProfile === id) {
      throw new Error(
        `« ${id} » est le profil par défaut : choisissez-en un autre avant de le supprimer.`,
      );
    }

    await deleteLocalProfile(id, profilesDir);
    return { catalog: await readCatalog() };
  });

  ipcMain.handle(IPC_CHANNELS.profileExport, async (_event, payload) => {
    const { id } = ProfileExportRequestSchema.parse(payload);
    await loadProfileCatalog({ profilesDir });
    const result = await exportProfile(id, { profilesDir });

    const target = await (dependencies.showSaveDialog ?? (() => Promise.resolve(undefined)))(
      `${result.exportedId}${PROFILE_FILE_EXTENSION}`,
    );
    // Dismissed: not an error, and nothing was written.
    if (target === undefined) return {};

    await (dependencies.writeExport ?? defaultWriteExport)(target, result.json);
    return { path: target };
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
    const shared = {
      id: definition.id,
      label: getProviderDefinition(definition.id).label,
      models: modelsForProvider(definition.id),
      requiresApiKey: true,
      supportsSecureAuth: true,
      envName,
    };
    if (env[envName]) {
      return { ...shared, configured: true, source: "environment" as const };
    }
    if (hydrated[envName]) {
      return { ...shared, configured: true, source: "keychain" as const };
    }
    return { ...shared, configured: false, source: "not_configured" as const };
  });

  const config = await load();
  const customProviders = config.providers ?? {};
  const hasCustom = Object.keys(customProviders).length > 0;
  statuses.push({
    id: OPENAI_COMPATIBLE_PROVIDER_ID,
    label: getProviderDefinition(OPENAI_COMPATIBLE_PROVIDER_ID).label,
    configured: hasCustom,
    source: hasCustom ? "config" : "not_configured",
    // A custom endpoint publishes no catalogue: its model is typed in.
    models: [],
    requiresApiKey: false,
    supportsSecureAuth: false,
  });
  statuses.push({
    id: "mock",
    label: getProviderDefinition("mock").label,
    configured: true,
    source: "builtin",
    models: modelsForProvider("mock"),
    requiresApiKey: false,
    supportsSecureAuth: false,
  });
  return statuses;
}

interface ProviderHandlerDependencies {
  ipcMain: IpcMainLike;
  env: NodeJS.ProcessEnv;
  load: () => Promise<Config>;
  save: (config: Config) => Promise<void>;
  hydrate: (env: NodeJS.ProcessEnv) => Promise<void>;
  removeCredential: (provider: CredentialProvider) => Promise<void>;
}

/**
 * Channels the settings use to manage providers after setup.
 *
 * Grouped in their own registration because they form one story — a key, an
 * endpoint, and what happens to the default when the last one is removed —
 * and because `registerIpcHandlers` is long enough already.
 */
function registerProviderManagementHandlers(dependencies: ProviderHandlerDependencies): void {
  const { ipcMain, env, load, save, hydrate, removeCredential } = dependencies;

  ipcMain.handle(IPC_CHANNELS.credentialDelete, async (_event, payload) => {
    const { provider } = CredentialDeleteRequestSchema.parse(payload);
    if (!isCredentialProvider(provider)) {
      throw new Error(`Le fournisseur ${provider} n'a pas de clé enregistrée dans le trousseau.`);
    }
    await removeCredential(provider);
    return { providers: await listProviderStatuses(env, hydrate, load) };
  });

  ipcMain.handle(IPC_CHANNELS.providerSave, async (_event, payload) => {
    const request = ProviderSaveRequestSchema.parse(payload);
    const config = await load();
    const existing = config.providers?.[request.id];

    const next = ConfigSchema.parse({
      ...config,
      providers: {
        ...(config.providers ?? {}),
        [request.id]: {
          type: OPENAI_COMPATIBLE_PROVIDER_ID,
          ...(request.name === undefined ? {} : { name: request.name }),
          baseUrl: request.baseUrl,
          ...(request.apiKeyEnv === undefined ? {} : { apiKeyEnv: request.apiKeyEnv }),
          // Carried over rather than taken from the request: headers may hold
          // an Authorization token, so they never cross to the renderer, and a
          // round trip through the settings must not quietly drop them.
          ...(existing?.customHeaders === undefined
            ? {}
            : { customHeaders: existing.customHeaders }),
        },
      },
    });
    await save(next);
    return {
      config: sanitizeConfigForRenderer(next),
      providers: await listProviderStatuses(env, hydrate, load),
    };
  });

  ipcMain.handle(IPC_CHANNELS.providerDelete, async (_event, payload) => {
    const { id } = ProviderDeleteRequestSchema.parse(payload);
    const config = await load();
    if (!config.providers?.[id]) {
      throw new Error(`Aucun fournisseur personnalisé nommé ${id}.`);
    }

    const remaining = Object.fromEntries(
      Object.entries(config.providers).filter(([key]) => key !== id),
    );

    // Removing the last endpoint while the configuration still points at the
    // compatible provider would leave nothing to call. The default moves back
    // to a provider that exists, with the model that goes with it.
    const orphaned =
      config.defaultProvider === OPENAI_COMPATIBLE_PROVIDER_ID &&
      Object.keys(remaining).length === 0;

    const next = ConfigSchema.parse({
      ...config,
      ...(orphaned
        ? {
            defaultProvider: DEFAULT_PROVIDER_ID,
            defaultModel: getFallbackModelForProvider(DEFAULT_PROVIDER_ID) ?? config.defaultModel,
          }
        : {}),
      providers: Object.keys(remaining).length > 0 ? remaining : undefined,
    });
    await save(next);
    return {
      config: sanitizeConfigForRenderer(next),
      providers: await listProviderStatuses(env, hydrate, load),
    };
  });
}

/** The preset catalogue for one provider, in the shape the renderer reads. */
function modelsForProvider(providerId: string): ProviderModelOption[] {
  return getPresetModels()
    .filter((preset) => preset.provider === providerId)
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      recommended: preset.recommended === true,
    }));
}

/**
 * Everything the onboarding window needs, in one round trip.
 *
 * Deliberately one call: the wizard needs the providers, their models, whether
 * each already has a credential, and whether it should be showing at all. Split
 * across channels, those answers could disagree with each other between two
 * renders.
 */
export async function buildOnboardingState(
  env: NodeJS.ProcessEnv,
  hydrate: (env: NodeJS.ProcessEnv) => Promise<void>,
  load: () => Promise<Config>,
  configFileExists: () => boolean,
): Promise<OnboardingStateResponse> {
  const statuses = await listProviderStatuses(env, hydrate, load);
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const config = await load();

  const providers = listProviderDefinitions()
    .filter((definition) => definition.visibleInInit)
    .map((definition) => {
      const status = statusById.get(definition.id);
      return {
        id: definition.id,
        label: definition.label,
        requiresApiKey: definition.requiresApiKey,
        ...(definition.apiKeyEnvName === undefined ? {} : { envName: definition.apiKeyEnvName }),
        supportsSecureAuth: definition.supportsSecureAuth,
        credentialConfigured: status?.configured ?? false,
        credentialSource: status?.source ?? ("not_configured" as const),
        models: modelsForProvider(definition.id),
      };
    });

  const state = evaluateSetupState({
    configFileExists: configFileExists(),
    provider: config.defaultProvider,
    credentialDetected: statusById.get(config.defaultProvider)?.configured ?? false,
    hasCustomProviderEntry: Object.keys(config.providers ?? {}).length > 0,
  });

  return {
    required: !state.usable,
    ...(state.blocker === undefined ? {} : { blocker: state.blocker }),
    providers,
    suggested: {
      provider: config.defaultProvider,
      model: config.defaultModel,
      profile: config.defaultProfile,
      level: config.defaultLevel,
    },
  };
}

/** Removes a credential through the shared auth service. */
async function defaultRemoveCredential(provider: CredentialProvider): Promise<void> {
  await logout(provider, { output: { log: () => undefined } });
}

/**
 * Stores a credential through the shared auth service.
 *
 * `login` is the CLI's path too; passing the secret as a dependency rather
 * than reading stdin is the only difference. Its output is silenced because
 * there is no terminal here — not because anything is skipped.
 */
async function defaultStoreCredential(
  provider: CredentialProvider,
  secret: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await login(provider, {
    env,
    readSecret: () => Promise.resolve(secret),
    output: {
      log: () => undefined,
      write: () => undefined,
    },
  });
}

/**
 * Default export writer.
 *
 * A plain file write: the path comes from the native save dialog, so it is the
 * user's own choice rather than anything the renderer could name.
 */
async function defaultWriteExport(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, "utf8");
}
