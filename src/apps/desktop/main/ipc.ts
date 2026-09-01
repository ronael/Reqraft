import process from "node:process";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { executeReprompt } from "@/application/reprompt.js";
import { hydrateCredentials, login, logout } from "@/auth/credentials.js";
import {
  configPath,
  loadConfig,
  loadUserConfig,
  saveConfig,
  DEFAULT_CONFIG,
} from "@/config/loader.js";
import { createInitConfig, evaluateSetupState } from "@/config/setup.js";
import { getFallbackModelForProvider, getPresetModels } from "@/models/presets.js";
import { DESKTOP_MESSAGES } from "@/i18n/desktop/index.js";
import { ConfigSchema, type Config } from "@/config/schema.js";
import {
  getProviderDefinition,
  getProviderEnvName,
  isCredentialProvider,
  listCredentialProviders,
  listProviderDefinitions,
  DEFAULT_PROVIDER_ID,
  OPENAI_COMPATIBLE_PROVIDER_ID,
  type BuiltinProvider,
  type CredentialProvider,
  type InitProvider,
} from "@/providers/catalog.js";
import { createProvider } from "@/providers/registry.js";
import type { ProviderAdapter, ProviderHealth } from "@/core/types.js";
import { REPROMPT_POLICY } from "@/core/reprompt-policy.js";
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
  CURRENT_WELCOME_TOUR_VERSION,
  CredentialDeleteRequestSchema,
  CredentialSaveRequestSchema,
  EmptyRequestSchema,
  LocaleReadRequestSchema,
  ModelsListRequestSchema,
  OnboardingCompleteRequestSchema,
  MODEL_CATALOG_LIMIT,
  ProviderDeleteRequestSchema,
  ProviderSaveRequestSchema,
  ProviderTestRequestSchema,
  ProfileDuplicateRequestSchema,
  ProfileExportRequestSchema,
  ProfileIdRequestSchema,
  ProfileSaveRequestSchema,
  RepromptCancelRequestSchema,
  RepromptStartRequestSchema,
  ResultAcceptRequestSchema,
  type DoctorReport,
  type DesktopUpdateState,
  type ProfileCatalogResponse,
  type ProfileDetail,
  type CapsuleOpenedPayload,
  type ModelCatalogEntry,
  type ModelsListRequest,
  type ModelsListResponse,
  type OnboardingStateResponse,
  type ProviderModelOption,
  type ProviderStatus,
  type ProviderTestOutcome,
  type ProviderTestRequest,
  type ProviderTestResponse,
  type SafeConfig,
  type ShortcutStateInfo,
} from "@/apps/desktop/shared/ipc-contract.js";
import { RepromptService, type RunEventSender } from "./reprompt-service.js";
import { buildDoctorReport, formatDoctorReport } from "./doctor.js";
import type { CaptureService } from "./capture-service.js";
import type { PermissionsReport } from "./permissions.js";
import { mainLocale, resolveMainLocale, t } from "./i18n.js";
import { version } from "@/version.js";

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
  /**
   * La configuration utilisateur seule, pour tout ce qui écrit.
   *
   * Retombe sur `loadConfig` quand elle n'est pas fournie : les tests injectent
   * une seule configuration et n'ont pas de projet autour d'eux.
   */
  loadUserConfig?: () => Promise<Config>;
  saveConfig?: (config: Config) => Promise<void>;
  hydrateCredentials?: (env: NodeJS.ProcessEnv) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  /** Lot 2: capture/reinjection orchestrator. Absent in tests → degraded. */
  captureService?: CaptureService;
  /** Lot 2: permissions probe (§5.9). Absent → explicit degraded mode. */
  probePermissions?: () => Promise<PermissionsReport>;
  /** Lot 2: triggers the macOS Accessibility prompt (explicit action only). */
  requestAccessibility?: () => void;
  updateState?: () => DesktopUpdateState;
  checkForUpdates?: () => Promise<DesktopUpdateState>;
  openUpdateDownload?: () => Promise<void>;
  /** Lot 4: opens the settings window (from the popover or the capsule). */
  openSettings?: () => void;
  /** Opens the welcome tour explicitly from Settings. */
  openWelcomeTour?: () => void;
  /** Pourquoi la capsule est ouverte, pour qu'elle puisse le demander. */
  capsulePending?: () => CapsuleOpenedPayload | null;
  /**
   * Cache la capsule avant de coller, et la ramène si le collage échoue.
   *
   * La capsule est un `type: "panel"` : sur macOS, un panneau non activant
   * garde le focus clavier **sans** rendre l'application frontmost. System
   * Events répondait donc que l'application source était déjà au premier plan,
   * `activateApp` confirmait une bascule qui n'avait jamais lieu, et ⌘V
   * atterrissait dans la capsule — sélection intacte, remplacement déclaré
   * réussi. Rendre le focus pour de bon est la seule façon de coller au bon
   * endroit.
   */
  hideCapsule?: () => void;
  showCapsule?: () => void;
  /** Lot 5: structured doctor report (settings Diagnostic tab). */
  runDoctorReport?: () => Promise<DoctorReport>;
  /**
   * Le dossier personnel retiré du rapport copié.
   *
   * Injecté pour la même raison que le reste : un test doit pouvoir décrire
   * une machine dont le home n'est pas celui qui exécute la suite.
   */
  homeDir?: () => string;
  /** Lot 5: registered/rejected global shortcuts (settings Shortcuts tab). */
  shortcutState?: () => ShortcutStateInfo;
  /**
   * Ré-enregistre les raccourcis globaux après un changement de réglage.
   *
   * Injecté : `globalShortcut` appartient au processus principal, et le
   * contrat doit rester testable sans Electron.
   */
  onShortcutsChanged?: (shortcuts: Config["desktopShortcuts"]) => void;
  /**
   * Relance l'application quand une préférence ne peut être appliquée
   * proprement qu'au démarrage, comme la langue du menu et des titres.
   */
  relaunchApp?: () => void;
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
  /** Called when a configured installation has finished or skipped its tour. */
  onWelcomeTourComplete?: () => void;
  /** Removes a provider credential. Defaults to the shared `auth` service. */
  removeCredential?: (provider: CredentialProvider) => Promise<void>;
  /**
   * Builds a provider adapter for `providers:test`.
   *
   * Injected for the same reason `doctor.ts` injects it: a check that reached
   * the real registry could only be exercised against real credentials, and
   * the failure paths — an adapter that throws, a health with an unknown code
   * — would never be covered at all.
   */
  createProvider?: (
    id: BuiltinProvider,
    env: NodeJS.ProcessEnv,
    config?: Config,
  ) => ProviderAdapter;
}

const EMPTY_SHORTCUT_STATE: ShortcutStateInfo = {
  registered: [],
  rejected: [],
  conflicts: [],
  suspended: false,
};

export function registerIpcHandlers(dependencies: DesktopIpcDependencies): void {
  const env = dependencies.env ?? process.env;
  const load = dependencies.loadConfig ?? loadConfig;
  const loadUser = dependencies.loadUserConfig ?? dependencies.loadConfig ?? loadUserConfig;
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

    // Le focus d'abord, la frappe ensuite : voir `hideCapsule`.
    dependencies.hideCapsule?.();
    const outcome = await dependencies.captureService.replace(result.rewritten);
    if (!outcome.applied) {
      // Le message d'échec s'affiche dans la capsule : la cacher sans la
      // ramener le rendrait invisible.
      dependencies.showCapsule?.();
    }
    return outcome;
  });

  ipcMain.handle(IPC_CHANNELS.configRead, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return sanitizeConfigForRenderer(await load());
  });

  ipcMain.handle(IPC_CHANNELS.configWrite, async (_event, payload) => {
    const patch = ConfigWriteRequestSchema.parse(payload);
    // Même raison que `rp config set` : on écrit dans la configuration de la
    // personne, donc on part d'elle. L'effective y ferait entrer les valeurs du
    // projet courant, qui n'ont rien à faire dans un fichier permanent.
    const current = await loadUser();
    // The desktop surface never enables telemetry, whatever the renderer asks.
    const merged: Config = ConfigSchema.parse({ ...current, ...patch, telemetry: false });
    await save(merged);
    // Un raccourci choisi et jamais appliqué est un réglage qui ment. Les
    // combinaisons étaient lues une seule fois au démarrage : changer le choix
    // ne faisait rien, et l'écran continuait d'annoncer l'ancien comme actif.
    if (patch.desktopShortcuts !== undefined) {
      dependencies.onShortcutsChanged?.(merged.desktopShortcuts);
    }
    if (
      patch.uiLocale !== undefined &&
      resolveMainLocale(current.uiLocale, env) !== resolveMainLocale(merged.uiLocale, env)
    ) {
      dependencies.relaunchApp?.();
    }
    return sanitizeConfigForRenderer(merged);
  });

  registerProviderStatusHandler(ipcMain, env, hydrate, load);

  registerUpdateHandlers(dependencies);

  const configExists = dependencies.configFileExists ?? (() => existsSync(configPath()));
  const storeCredential = dependencies.storeCredential ?? defaultStoreCredential;
  const removeCredential = dependencies.removeCredential ?? defaultRemoveCredential;
  const onboardingState = (): Promise<OnboardingStateResponse> =>
    buildOnboardingState(env, hydrate, load, configExists);

  ipcMain.handle(IPC_CHANNELS.onboardingState, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return await onboardingState();
  });

  ipcMain.handle(IPC_CHANNELS.onboardingTourComplete, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    const current = await loadUser();
    await save(
      ConfigSchema.parse({
        ...current,
        desktopWelcomeTourVersion: CURRENT_WELCOME_TOUR_VERSION,
      }),
    );
    const state = await onboardingState();
    if (!state.required) {
      dependencies.onWelcomeTourComplete?.();
    }
    return state;
  });

  registerCredentialSaveHandler({
    ipcMain,
    env,
    load,
    loadUser,
    save,
    hydrate,
    storeCredential,
  });

  registerProviderManagementHandlers({
    ipcMain,
    env,
    load,
    save,
    hydrate,
    removeCredential,
    create: dependencies.createProvider ?? createProvider,
  });

  ipcMain.handle(IPC_CHANNELS.onboardingComplete, async (_event, payload) => {
    const request = OnboardingCompleteRequestSchema.parse(payload);
    if (!getProviderDefinition(request.provider).visibleInInit) {
      throw new Error(t("main.errorProviderNotSelectable", { provider: request.provider }));
    }

    // Built by the shared domain, so the file the desktop writes is the file
    // `rp init` would have written — one configuration, two front ends.
    const existing = configExists() ? await load() : undefined;
    const config = createInitConfig({
      provider: request.provider as InitProvider,
      model: request.model,
      profile: request.profile,
      level: request.level,
      ...(request.uiLocale === undefined ? {} : { uiLocale: request.uiLocale }),
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

  registerDoctorHandlers(dependencies, env);

  ipcMain.handle(IPC_CHANNELS.permissionsState, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    if (!dependencies.probePermissions) {
      // No probe wired (tests): the explicit degraded mode promised by §2.6.
      return { accessibility: false, canReplace: false, reason: t("main.permissionsPending") };
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
      {
        id: AUTO_PROFILE_ID,
        name: t("main.autoProfileName"),
        description: t("main.autoProfileSummary"),
      },
      ...listProfiles().map((profile) => ({
        id: profile.id,
        name: profile.name,
        description: profile.description,
      })),
    ];
  });

  registerProfileIpcHandlers(dependencies, load);

  ipcMain.handle(IPC_CHANNELS.localeRead, (_event, payload) => {
    const request = LocaleReadRequestSchema.parse(payload);
    // Par défaut, la langue arrêtée au démarrage — pas celle du fichier : sans
    // cela, une fenêtre ouverte après un changement de réglage parlerait une
    // autre langue que le menu de la barre, qui ne peut plus être réétiqueté.
    const locale = request?.locale ?? mainLocale();
    return { locale, messages: DESKTOP_MESSAGES[locale] };
  });

  ipcMain.handle(IPC_CHANNELS.capsulePending, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return dependencies.capsulePending?.() ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.windowOpenSettings, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    dependencies.openSettings?.();
  });

  ipcMain.handle(IPC_CHANNELS.windowOpenWelcomeTour, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    dependencies.openWelcomeTour?.();
  });

  ipcMain.handle(IPC_CHANNELS.shortcutsState, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    // Without a wired source (tests), report the honest empty state.
    return dependencies.shortcutState?.() ?? EMPTY_SHORTCUT_STATE;
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
    const catalog = await loadProfileCatalog({ profilesDir, projectProfilesDir: null });
    return {
      entries: [
        {
          id: AUTO_PROFILE_ID,
          name: t("main.autoProfileName"),
          description: t("main.autoProfileDescription"),
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
        kind: problem.kind,
      })),
    };
  }

  /** Refuses anything that is not a local profile, with the reason. */
  function assertLocal(id: string): void {
    if (getProfileOrigin(id) === "builtin") {
      throw new Error(t("main.errorProfileBuiltin", { id }));
    }
  }

  ipcMain.handle(IPC_CHANNELS.profilesCatalog, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return readCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.profileRead, async (_event, payload) => {
    const { id } = ProfileIdRequestSchema.parse(payload);
    await loadProfileCatalog({ profilesDir, projectProfilesDir: null });
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
    await loadProfileCatalog({ profilesDir, projectProfilesDir: null });

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
    await loadProfileCatalog({ profilesDir, projectProfilesDir: null });
    await duplicateProfile(request.sourceId, request.targetId, {
      profilesDir,
      ...(request.name === undefined ? {} : { name: request.name }),
    });
    return { catalog: await readCatalog() };
  });

  ipcMain.handle(IPC_CHANNELS.profileDelete, async (_event, payload) => {
    const { id } = ProfileIdRequestSchema.parse(payload);
    await loadProfileCatalog({ profilesDir, projectProfilesDir: null });
    assertLocal(id);

    // A configuration left pointing at a deleted profile turns every later run
    // into an unknown-profile failure.
    const config = await load();
    if (config.defaultProfile === id) {
      throw new Error(t("main.errorProfileIsDefault", { id }));
    }

    await deleteLocalProfile(id, profilesDir);
    return { catalog: await readCatalog() };
  });

  ipcMain.handle(IPC_CHANNELS.profileExport, async (_event, payload) => {
    const { id } = ProfileExportRequestSchema.parse(payload);
    await loadProfileCatalog({ profilesDir, projectProfilesDir: null });
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
  const config = await load();
  const preferredKeychainProviders = new Set(config.desktopKeychainProviders ?? []);

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
    if (preferredKeychainProviders.has(definition.id) && env[envName]) {
      return { ...shared, configured: true, source: "keychain" as const };
    }
    if (env[envName]) {
      return { ...shared, configured: true, source: "environment" as const };
    }
    if (hydrated[envName]) {
      return { ...shared, configured: true, source: "keychain" as const };
    }
    return { ...shared, configured: false, source: "not_configured" as const };
  });

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
  return statuses;
}

interface ProviderHandlerDependencies {
  ipcMain: IpcMainLike;
  env: NodeJS.ProcessEnv;
  load: () => Promise<Config>;
  save: (config: Config) => Promise<void>;
  hydrate: (env: NodeJS.ProcessEnv) => Promise<void>;
  removeCredential: (provider: CredentialProvider) => Promise<void>;
  create: NonNullable<DesktopIpcDependencies["createProvider"]>;
}

/**
 * Channels the settings use to manage providers after setup.
 *
 * Grouped in their own registration because they form one story — a key, an
 * endpoint, and what happens to the default when the last one is removed —
 * and because `registerIpcHandlers` is long enough already.
 */
function registerProviderManagementHandlers(dependencies: ProviderHandlerDependencies): void {
  const { ipcMain, env, load, save, hydrate, removeCredential, create } = dependencies;

  ipcMain.handle(IPC_CHANNELS.providerTest, async (_event, payload) => {
    const request = ProviderTestRequestSchema.parse(payload);
    return await testProvider(request, { env, load, hydrate, create });
  });

  // Registered here rather than on its own: it needs exactly the same four
  // dependencies, and it builds its adapter through the same resolution as the
  // check above — the tab must never list one provider's models while the
  // check reports on another.
  ipcMain.handle(IPC_CHANNELS.modelsList, async (_event, payload) => {
    const request = ModelsListRequestSchema.parse(payload);
    return await listProviderModels(request, { env, load, hydrate, create });
  });

  ipcMain.handle(IPC_CHANNELS.credentialDelete, async (_event, payload) => {
    const { provider } = CredentialDeleteRequestSchema.parse(payload);
    if (!isCredentialProvider(provider)) {
      throw new Error(t("main.errorProviderNoStoredKey", { provider }));
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
      throw new Error(t("main.errorProviderUnknown", { id }));
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

/**
 * Names a configuration entry may take before it is allowed across the bridge.
 *
 * `missingConfiguration` is written by the adapter, and the compatible one is
 * pointed at an endpoint the user chose. Nothing today puts a value in that
 * list, and this makes sure nothing ever starts: an environment variable name
 * or `baseUrl` passes, a key or a URL does not.
 */
const CONFIGURATION_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

interface ProviderTestContext {
  env: NodeJS.ProcessEnv;
  load: () => Promise<Config>;
  hydrate: (env: NodeJS.ProcessEnv) => Promise<void>;
  create: NonNullable<DesktopIpcDependencies["createProvider"]>;
}

/**
 * Les deux canaux du diagnostic, enregistrés ensemble.
 *
 * `doctor:run` affiche le rapport, `doctor:copy` le copie : ils partagent une
 * seule construction, sinon le texte partagé dans une issue finirait par ne
 * plus décrire ce que l'utilisateur a sous les yeux.
 */
function registerDoctorHandlers(
  dependencies: DesktopIpcDependencies,
  env: NodeJS.ProcessEnv,
): void {
  const { ipcMain, clipboard } = dependencies;

  const doctorReport = async (): Promise<DoctorReport> => {
    if (dependencies.runDoctorReport) {
      return await dependencies.runDoctorReport();
    }
    const permissions = dependencies.probePermissions
      ? await dependencies.probePermissions()
      : undefined;
    const shortcuts = dependencies.shortcutState?.();
    return await buildDoctorReport({ env, permissions, shortcuts });
  };

  ipcMain.handle(IPC_CHANNELS.doctorRun, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return await doctorReport();
  });

  ipcMain.handle(IPC_CHANNELS.doctorCopy, async (_event, payload) => {
    // Charge utile strictement vide : le renderer déclenche une copie, il ne
    // choisit jamais son contenu, et aucune chaîne venue de lui n'atteint le
    // presse-papiers par ce chemin.
    EmptyRequestSchema.parse(payload);
    clipboard.writeText(
      formatDoctorReport(await doctorReport(), {
        version,
        platform: process.platform,
        homeDir: dependencies.homeDir?.() ?? homedir(),
      }),
    );
    return { copied: true };
  });
}

/**
 * Checks one provider, the way `doctor.ts` checks all of them.
 *
 * Same three steps — hydrate into a throwaway environment, build the adapter,
 * ask it to validate itself — so the settings and the diagnostic can never
 * disagree about the same provider. What differs is the answer: the diagnostic
 * prints a sentence, and this returns a verdict the renderer translates, so no
 * string written by an adapter or returned by a remote endpoint crosses.
 *
 * The check is local. Every adapter's `validateConfiguration()` reads what is
 * configured and returns; none of them opens a connection. A green result
 * therefore means "this configuration holds together", not "the provider
 * answered" — which is what the wording in the settings says.
 */
async function testProvider(
  request: ProviderTestRequest,
  context: ProviderTestContext,
): Promise<ProviderTestResponse> {
  const resolved = await resolveProviderAdapter(request, context);
  if ("verdict" in resolved) {
    return { id: request.id, ...resolved.verdict };
  }
  return await runValidation(request.id, resolved.build);
}

/** A conclusion reached without ever building an adapter. */
interface ProviderVerdict {
  outcome: ProviderTestOutcome;
  missing?: string[];
}

/** Either something to build, or a reason there is nothing worth building. */
type ProviderResolution = { build: () => ProviderAdapter } | { verdict: ProviderVerdict };

/**
 * Turns a provider request into the adapter it names.
 *
 * Shared by `providers:test` and `models:list` rather than written twice: both
 * hydrate the credentials into a throwaway environment, both have to narrow a
 * compatible endpoint to the one that was asked for, and both must refuse an
 * endpoint the configuration does not hold. Two copies of that would be two
 * chances for one of them to test — or list — the wrong provider.
 *
 * Structurally typed on `kind`/`id` so each channel keeps its own, narrower
 * request schema: the two accept different sets of built-in identifiers.
 */
async function resolveProviderAdapter(
  request: { kind: "builtin"; id: BuiltinProvider } | { kind: "endpoint"; id: string },
  context: ProviderTestContext,
): Promise<ProviderResolution> {
  // Hydration copies keychain entries into a throwaway environment, exactly as
  // the statuses do. The values stay on this side of the bridge.
  const hydrated = { ...context.env };
  await context.hydrate(hydrated);
  const config = await context.load();

  if (request.kind === "endpoint") {
    // Refused before anything is built: an endpoint the configuration does not
    // hold is a request the renderer had no way to produce, and answering it
    // with a verdict would dress a contract violation up as a test result.
    const endpoint = config.providers?.[request.id];
    if (!endpoint) {
      throw new Error(t("main.errorProviderUnknown", { id: request.id }));
    }
    if (endpoint.apiKeyEnv && !hydrated[endpoint.apiKeyEnv]) {
      const missing = CONFIGURATION_NAME_PATTERN.test(endpoint.apiKeyEnv)
        ? [endpoint.apiKeyEnv]
        : undefined;
      return {
        verdict: {
          outcome: "missing_configuration",
          ...(missing ? { missing } : {}),
        },
      };
    }
    // Narrowed to the requested endpoint: the registry builds the compatible
    // provider from the FIRST entry of `providers`, so handing it the whole
    // map would test the same one whichever row was clicked.
    return {
      build: () =>
        context.create(OPENAI_COMPATIBLE_PROVIDER_ID, hydrated, {
          ...config,
          providers: { [request.id]: endpoint },
        }),
    };
  }

  return { build: () => context.create(request.id, hydrated, config) };
}

/** `ProviderHealth` as the closed verdict the contract allows across. */
function verdictOfHealth(health: ProviderHealth): ProviderVerdict {
  if (health.ok) {
    return { outcome: "ok" };
  }
  const missing = (health.missingConfiguration ?? []).filter((name) =>
    CONFIGURATION_NAME_PATTERN.test(name),
  );
  return {
    outcome: outcomeOfHealthCode(health.code),
    ...(missing.length > 0 ? { missing } : {}),
  };
}

/** Builds the adapter and turns whatever comes back into a closed verdict. */
async function runValidation(
  id: string,
  build: () => ProviderAdapter,
): Promise<ProviderTestResponse> {
  try {
    return { id, ...verdictOfHealth(await build().validateConfiguration()) };
  } catch {
    // Swallowed on purpose. A registry error carries a provider id, an adapter
    // error can carry a URL, and a rejected fetch carries the host it tried —
    // none of that belongs in a settings window, and the renderer already has
    // wording for a check that did not conclude.
    return { id, outcome: "error" };
  }
}

/**
 * Names a model identifier may take before it is allowed across the bridge.
 *
 * A catalogue is remote data. Whatever an endpoint returns lands in a `<select>`
 * and, once chosen, in the user's configuration file — so what crosses has to
 * look like an identifier, not like a sentence, a URL or a newline. Anything
 * that does not is dropped rather than repaired: a model whose id we had to fix
 * is a model the provider would not have accepted back.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][\w./:@-]{0,127}$/;

/** Longest display name kept. Past this it is prose, not a name. */
const MODEL_NAME_MAX_LENGTH = 80;

/**
 * A catalogue, reduced to what may be shown.
 *
 * Exported for its own test: every rule here exists because the input is
 * written by a remote endpoint. Ids that do not look like identifiers go, ids
 * repeated go — a provider listing the same model twice would otherwise give
 * React two options with the same key — and the list is capped, with
 * `truncated` saying so instead of the tail disappearing in silence.
 */
export function sanitizeModelCatalog(models: unknown): {
  models: ModelCatalogEntry[];
  truncated: boolean;
} {
  if (!Array.isArray(models)) {
    return { models: [], truncated: false };
  }

  const sanitized: ModelCatalogEntry[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const model of models) {
    const candidate = modelCatalogCandidate(model);
    if (candidate !== undefined && !seen.has(candidate.id)) {
      seen.add(candidate.id);
      if (sanitized.length >= MODEL_CATALOG_LIMIT) {
        // Known to exist, deliberately not carried: the answer says the list
        // was cut rather than pretending this was all of it.
        truncated = true;
      } else {
        sanitized.push(candidate);
      }
    }
  }

  return { models: sanitized, truncated };
}

function modelCatalogCandidate(value: unknown): ModelCatalogEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  return MODEL_ID_PATTERN.test(id) ? { id, name: cleanModelName(record.name, id) } : undefined;
}

/** A display name flattened to one line, or the id when nothing is left. */
function cleanModelName(name: unknown, fallback: string): string {
  if (typeof name !== "string") return fallback;
  const flattened = name
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MODEL_NAME_MAX_LENGTH)
    .trim();
  return flattened === "" ? fallback : flattened;
}

/**
 * The models one provider publishes, for the settings Modèles tab.
 *
 * `ProviderAdapter.listModels` is optional: the mock adapter does not expose
 * it, and a custom endpoint that speaks a partial OpenAI dialect may reject
 * `/models`. `unsupported` and `error` are therefore normal fallback states,
 * and the tab keeps its free text field for both.
 *
 * Unlike `providers:test`, this one does reach the network: a catalogue is not
 * something the machine holds. The configuration is checked first, so a
 * provider with no key is told so instead of being called and refused.
 */
async function listProviderModels(
  request: ModelsListRequest,
  context: ProviderTestContext,
): Promise<ModelsListResponse> {
  const empty: Pick<ModelsListResponse, "models" | "truncated"> = {
    models: [],
    truncated: false,
  };

  try {
    const resolved = await resolveProviderAdapter(request, context);
    if ("verdict" in resolved) {
      return { id: request.id, ...empty, ...resolved.verdict };
    }
    const adapter = resolved.build();
    if (!adapter.listModels) {
      return { id: request.id, outcome: "unsupported", ...empty };
    }
    const verdict = verdictOfHealth(await adapter.validateConfiguration());
    if (verdict.outcome !== "ok") {
      return { id: request.id, ...empty, ...verdict };
    }
    const catalog = await adapter.listModels(
      AbortSignal.timeout(REPROMPT_POLICY.runtime.connectionCheckTimeoutMs),
    );
    return { id: request.id, outcome: "ok", ...sanitizeModelCatalog(catalog) };
  } catch {
    // Swallowed for the same reason `runValidation` swallows: an adapter error
    // carries the URL it called, a rejected fetch carries the host, and a
    // timeout carries neither but is still a sentence nobody translated.
    return { id: request.id, outcome: "error", ...empty };
  }
}

/** `ProviderHealth.code` as the contract's closed list of outcomes. */
function outcomeOfHealthCode(code: ProviderHealth["code"]): ProviderTestOutcome {
  switch (code) {
    case "missing_configuration":
      return "missing_configuration";
    case "invalid_configuration":
      return "invalid_configuration";
    case "unreachable":
      return "unreachable";
    default:
      // Not ok, and no reason given: reported as a check that did not
      // conclude rather than silently promoted to one of the known causes.
      return "error";
  }
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
    welcomeTourRequired: config.desktopWelcomeTourVersion !== CURRENT_WELCOME_TOUR_VERSION,
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

function registerUpdateHandlers(dependencies: DesktopIpcDependencies): void {
  dependencies.ipcMain.handle(IPC_CHANNELS.updatesState, (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return dependencies.updateState?.() ?? { status: "idle", currentVersion: version };
  });
  dependencies.ipcMain.handle(IPC_CHANNELS.updatesCheck, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return (await dependencies.checkForUpdates?.()) ?? { status: "idle", currentVersion: version };
  });
  dependencies.ipcMain.handle(IPC_CHANNELS.updatesOpenDownload, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    await dependencies.openUpdateDownload?.();
  });
}

function registerProviderStatusHandler(
  ipcMain: IpcMainLike,
  env: NodeJS.ProcessEnv,
  hydrate: (env: NodeJS.ProcessEnv) => Promise<void>,
  load: () => Promise<Config>,
): void {
  ipcMain.handle(IPC_CHANNELS.providersStatus, async (_event, payload) => {
    EmptyRequestSchema.parse(payload);
    return listProviderStatuses(env, hydrate, load);
  });
}

function registerCredentialSaveHandler(options: {
  ipcMain: IpcMainLike;
  env: NodeJS.ProcessEnv;
  load: () => Promise<Config>;
  loadUser: () => Promise<Config>;
  save: (config: Config) => Promise<void>;
  hydrate: (env: NodeJS.ProcessEnv) => Promise<void>;
  storeCredential: NonNullable<DesktopIpcDependencies["storeCredential"]>;
}): void {
  options.ipcMain.handle(IPC_CHANNELS.credentialSave, async (_event, payload) => {
    const request = CredentialSaveRequestSchema.parse(payload);
    if (!isCredentialProvider(request.provider)) {
      throw new Error(t("main.errorProviderNotStorable", { provider: request.provider }));
    }
    await options.storeCredential(request.provider, request.secret, options.env);
    if (request.preferKeychain === true) {
      const current = await options.loadUser();
      const preferred = new Set(current.desktopKeychainProviders ?? []);
      preferred.add(request.provider);
      await options.save(
        ConfigSchema.parse({ ...current, desktopKeychainProviders: [...preferred] }),
      );
      Reflect.deleteProperty(options.env, getProviderEnvName(request.provider));
      await options.hydrate(options.env);
    }
    return {
      providers: await listProviderStatuses(options.env, options.hydrate, options.load),
    };
  });
}
