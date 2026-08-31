import { z } from "zod";
import { RepromptLevelSchema } from "@/core/levels.js";
import { ConfigSchema, type Config, type ConfigKey } from "@/config/schema.js";
import type { RepromptResult } from "@/core/types.js";
import type { UiError } from "@/shared/errors.js";
import {
  CUSTOM_PROFILE_ID_MAX_LENGTH,
  CUSTOM_PROFILE_ID_REGEX,
  isValidCustomProfileId,
} from "@/profiles/custom.js";
import { AUTO_PROFILE_ID, BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";
import { BUILTIN_PROVIDER_IDS } from "@/providers/catalog.js";
import type { SetupBlocker } from "@/config/setup.js";

/**
 * Re-exported so the renderer can recognise the `auto` sentinel without
 * importing from the core tree, which its bundle must stay free of.
 */
export { AUTO_PROFILE_ID };

/**
 * IPC contract (DESKTOP.md §8.1): payload types and the Zod schemas validating
 * every message that enters the main process. The renderer is treated as
 * untrusted even though it ships from the same repository.
 *
 * This module is imported by the main process, by the preload (types only)
 * and by the renderer (types only). Runtime imports must stay pure: anything
 * Node- or Electron-specific belongs to `main/`.
 */

// --- Renderer → main, requests ------------------------------------------------

/**
 * Level cycle for the capsule's ⇥ shortcut. Mirrors `core/levels.ts`
 * REPROMPT_LEVELS — the renderer may not import the core (§4.2), and a unit
 * test fails if the two lists drift.
 */
export const REPROMPT_LEVEL_IDS = ["minimal", "standard", "complete"] as const;

export const RepromptStartRequestSchema = z
  .object({
    input: z.string().min(1),
    profileId: z.string().min(1).optional(),
    level: RepromptLevelSchema.optional(),
    providerId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
  })
  .strict();
export type RepromptStartRequest = z.infer<typeof RepromptStartRequestSchema>;

export const RepromptCancelRequestSchema = z.object({ runId: z.string().min(1) }).strict();
export type RepromptCancelRequest = z.infer<typeof RepromptCancelRequestSchema>;

export const RESULT_ACCEPT_MODES = ["replace", "copy"] as const;
export type ResultAcceptMode = (typeof RESULT_ACCEPT_MODES)[number];

export const ResultAcceptRequestSchema = z
  .object({ runId: z.string().min(1), mode: z.enum(RESULT_ACCEPT_MODES) })
  .strict();
export type ResultAcceptRequest = z.infer<typeof ResultAcceptRequestSchema>;

/** Channels documented as `void` input accept no payload at all. */
export const EmptyRequestSchema = z.undefined();

/**
 * Lire une autre langue que celle du démarrage.
 *
 * Sans argument, le canal rend la langue en vigueur. Avec, il rend le
 * catalogue demandé : l'onboarding et les réglages montrent ainsi le résultat
 * d'un choix avant qu'il ne soit enregistré, sans embarquer les catalogues
 * dans le renderer.
 */
export const LocaleReadRequestSchema = z
  .object({ locale: z.enum(["en", "fr"]).optional() })
  .strict()
  .optional();
export type LocaleReadRequest = z.infer<typeof LocaleReadRequestSchema>;

export const ConfigWriteRequestSchema = ConfigSchema.partial();
export type ConfigWriteRequest = z.infer<typeof ConfigWriteRequestSchema>;

// --- Renderer → main, responses -----------------------------------------------

export interface RepromptStartResponse {
  runId: string;
  /**
   * The profile the run was STARTED with, with aliases already canonicalised.
   *
   * For an explicit profile this is also the profile that will be applied, so
   * the capsule can display it from the first frame. For `auto` this stays the
   * `auto` sentinel: nothing is resolved locally at start. The model picks the
   * profile in the same call that produces the rewrite, and the applied one
   * only becomes known with the result — `RepromptResult.profile`, which is
   * the single source of truth once a run is done.
   */
  requestedProfile: string;
}

/**
 * `reason` porte pourquoi la capture n'a rien donné.
 *
 * Sans ce champ l'échec était muet par construction : la capsule s'ouvrait en
 * saisie libre, indiscernable d'un déclenchement volontaire sans sélection, et
 * une permission macOS refusée ressemblait à une application cassée.
 */
export type CaptureSelectionResponse =
  { text: string; sourceApp: string } | { empty: true; reason?: string };

export interface ResultAcceptResponse {
  applied: boolean;
  /**
   * Pourquoi le remplacement n'a pas eu lieu.
   *
   * `ReplaceOutcome` la porte depuis toujours, mais elle s'arrêtait ici : la
   * capsule ne pouvait dire que « remplacement impossible », sans jamais
   * distinguer une permission refusée d'une application source qui n'est pas
   * revenue au premier plan. Même oubli que pour la raison d'une capture vide.
   */
  reason?: string;
}

/**
 * `Config` as the renderer is allowed to see it: custom provider definitions
 * keep their name and URL but never their headers, which may carry an
 * Authorization token. API keys never appear in `Config` at all — they live
 * in the environment and the keychain (DESKTOP.md §2.2).
 *
 * Built with `Pick` over the known keys: `Config` is a passthrough schema
 * (string index signature), and `Omit` would widen every field to `unknown`.
 */
export type SafeCustomProviderConfig = Omit<
  NonNullable<Config["providers"]>[string],
  "customHeaders"
>;
export type SafeConfig = Pick<Config, ConfigKey> & {
  providers?: Record<string, SafeCustomProviderConfig>;
  /**
   * Not a `ConfigKey`: those are the scalar settings `rp config` exposes, and
   * `rp config set desktopShortcuts` would mean nothing. Named here instead,
   * the way `providers` is.
   */
  desktopShortcuts?: { capture?: string; input?: string };
};

export type ProviderCredentialSource =
  "environment" | "keychain" | "config" | "builtin" | "not_configured";

/**
 * A provider the catalogue knows about.
 *
 * Narrowed rather than left as a string: these ids come from the catalogue,
 * and typing them loosely pushes to runtime what the compiler can settle —
 * such as whether a provider can be handed to `credential:save` at all.
 */
export type CatalogProviderId = (typeof BUILTIN_PROVIDER_IDS)[number];

export interface ProviderStatus {
  id: CatalogProviderId;
  /** Human-readable name, so the settings never print a bare identifier. */
  label: string;
  configured: boolean;
  source: ProviderCredentialSource;
  /** Empty for a provider with no catalogue, such as a custom endpoint. */
  models: ProviderModelOption[];
  /** Whether this provider is unusable without a key. */
  requiresApiKey: boolean;
  /** Whether its key can be stored in the OS keychain from here. */
  supportsSecureAuth: boolean;
  /** Environment variable carrying its key, when it has one. */
  envName?: string;
}

export type DesktopUpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "error";

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  checkedAt?: string;
  publishedAt?: string;
}

export interface DoctorCheck {
  id: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
}

export interface PermissionsState {
  accessibility: boolean;
  canReplace: boolean;
  reason?: string;
}

export interface PermissionsRequestResult {
  accessibility: boolean;
}

/**
 * A profile as the renderer is allowed to see it: identity and wording only.
 * `instructions` (the prompt itself) and `detect` (a function) never cross
 * the IPC — the engine owns them.
 */
export interface ProfileSummary {
  id: string;
  name: string;
  description: string;
}

/** Where a profile comes from, and therefore what may be done to it. */
export const PROFILE_ORIGINS = ["auto", "builtin", "local"] as const;
export type ProfileOriginId = (typeof PROFILE_ORIGINS)[number];

/**
 * A catalogue row for the settings Profils tab.
 *
 * Still identity and wording only — `instructions` stays out. The renderer
 * lists profiles far more often than it edits one, and a list is not a reason
 * to push every prompt across the bridge.
 */
export interface ProfileCatalogEntry extends ProfileSummary {
  origin: ProfileOriginId;
  /** Shown beside the row, and pre-filled when the profile is duplicated. */
  defaultLevel?: (typeof REPROMPT_LEVEL_IDS)[number];
}

/**
 * A local profile file, whole. Crosses the bridge only when the user opens one
 * for editing — never as part of a listing.
 */
export interface ProfileDetail {
  id: string;
  name: string;
  description: string;
  /** Built-in id this profile inherits from, or absent. */
  extends?: string;
  defaultLevel: (typeof REPROMPT_LEVEL_IDS)[number];
  instructions: string;
}

/** A local profile file the catalogue could not load, reported not hidden. */
export interface ProfileCatalogProblemInfo {
  /** Cassé, ou seulement recouvert par un profil du projet. */
  kind: "invalid" | "shadowed";
  id: string;
  path: string;
  detail: string;
}

export interface ProfileCatalogResponse {
  entries: ProfileCatalogEntry[];
  problems: ProfileCatalogProblemInfo[];
}

const PROFILE_ID_ERROR =
  "A profile identifier must be normalised: lowercase letters, digits and hyphens only.";

const ProfileIdSchema = z
  .string()
  .min(1)
  .max(CUSTOM_PROFILE_ID_MAX_LENGTH)
  .regex(CUSTOM_PROFILE_ID_REGEX, PROFILE_ID_ERROR);

const WritableProfileIdSchema = ProfileIdSchema.refine((id) => isValidCustomProfileId(id), {
  message: "This local profile identifier is reserved, built-in or not portable. Pick another one.",
});

const ExportableProfileIdSchema = ProfileIdSchema.refine((id) => id !== AUTO_PROFILE_ID, {
  message: "The automatic profile can be neither exported nor duplicated.",
});

export const ProfileIdRequestSchema = z.object({ id: ProfileIdSchema }).strict();
export type ProfileIdRequest = z.infer<typeof ProfileIdRequestSchema>;

/**
 * Create or update, told apart by `mode` rather than guessed from whether the
 * file exists: `create` must refuse an id already taken, and `update` must
 * refuse to invent one. Guessing would silently do the other thing.
 */
export const ProfileSaveRequestSchema = z
  .object({
    mode: z.enum(["create", "update"]),
    profile: z
      .object({
        id: WritableProfileIdSchema,
        name: z.string().min(1),
        description: z.string().min(1),
        extends: z.enum(BUILTIN_PROFILE_IDS).optional(),
        defaultLevel: RepromptLevelSchema,
        instructions: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type ProfileSaveRequest = z.infer<typeof ProfileSaveRequestSchema>;

export const ProfileDuplicateRequestSchema = z
  .object({
    sourceId: ExportableProfileIdSchema,
    targetId: WritableProfileIdSchema,
    name: z.string().min(1).optional(),
  })
  .strict();
export type ProfileDuplicateRequest = z.infer<typeof ProfileDuplicateRequestSchema>;

export const ProfileExportRequestSchema = z.object({ id: ExportableProfileIdSchema }).strict();
export type ProfileExportRequest = z.infer<typeof ProfileExportRequestSchema>;

/** `path` is absent when the user dismissed the native save dialog. */
export interface ProfileExportResponse {
  path?: string;
}

/** What a mutation gives back: the refreshed catalogue, so nothing goes stale. */
export interface ProfileMutationResponse {
  catalog: ProfileCatalogResponse;
}

/**
 * Combinations offered in the settings, per intent.
 *
 * A fixed list rather than a key recorder: recording a keystroke reliably means
 * intercepting every key while the field has focus, and getting that wrong
 * leaves the user unable to leave the field. A short list of combinations that
 * are known to register — and known not to collide with macOS or the common
 * launchers — answers the same need without that risk.
 */
export const SHORTCUT_PRESETS = {
  capture: ["Command+Control+R", "Command+Control+J", "Command+Control+G", "Command+Control+B"],
  input: ["Command+Control+N", "Command+Control+K", "Command+Control+M", "Command+Control+P"],
} as const;

/** Registered/rejected global shortcuts, for the settings Shortcuts tab. */
export interface ShortcutStateInfo {
  registered: { accelerator: string; label: string; intent: "capture" | "input" }[];
  /** Accelerators whose registration returned false — already taken (§5.5). */
  rejected: string[];
}

/**
 * A custom OpenAI-compatible endpoint, as declared in the configuration.
 *
 * `customHeaders` is deliberately absent: it may carry an Authorization token,
 * so it never reaches the renderer (§2.2). The main process merges it back on
 * save — a round trip through this shape must not silently drop it.
 */
export const ProviderSaveRequestSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "A provider identifier must be lowercase."),
    name: z.string().trim().min(1).optional(),
    baseUrl: z
      .string()
      .trim()
      .refine(
        (value) => {
          const parsed = URL.parse(value);
          return parsed?.protocol === "http:" || parsed?.protocol === "https:";
        },
        { message: "L'URL de base doit commencer par http:// ou https://." },
      ),
    apiKeyEnv: z.string().trim().min(1).optional(),
  })
  .strict();
export type ProviderSaveRequest = z.infer<typeof ProviderSaveRequestSchema>;

export const ProviderDeleteRequestSchema = z.object({ id: z.string().trim().min(1) }).strict();
export type ProviderDeleteRequest = z.infer<typeof ProviderDeleteRequestSchema>;

export const CredentialDeleteRequestSchema = z
  .object({ provider: z.enum(BUILTIN_PROVIDER_IDS) })
  .strict();
export type CredentialDeleteRequest = z.infer<typeof CredentialDeleteRequestSchema>;

/**
 * What every provider mutation gives back: the configuration as saved and the
 * refreshed statuses. Deleting the endpoint currently selected as the default
 * changes the default too, so the renderer must never assume its own state
 * survived the call.
 */
export interface ProviderMutationResponse {
  config: SafeConfig;
  providers: ProviderStatus[];
}

// --- Onboarding ----------------------------------------------------------------

/** Increment only when every installation should see a materially new tour. */
export const CURRENT_WELCOME_TOUR_VERSION = 1;

/**
 * Why the desktop opened its onboarding instead of going straight to work.
 *
 * Type-only: the rule itself lives in `@/config/setup.ts` and is shared with
 * `rp init`, so the two interfaces cannot drift into disagreeing about whether
 * the same machine is configured.
 */
export type { SetupBlocker };

/**
 * A provider the wizard may offer.
 *
 * Narrowed to the catalogue rather than left as a string: the renderer picks
 * one from a list the main process sent, so an id outside that set is a bug,
 * and typing it as `string` would only push the check to runtime.
 */
/**
 * A model a provider can be asked to run.
 *
 * Sent by the main process rather than read from the catalogue: the renderer
 * cannot import `@/models`, and a settings window that lets someone type any
 * identifier — with no idea which ones the provider actually supports — is how
 * a configuration ends up pointing an Anthropic model at OpenAI.
 */
export interface ProviderModelOption {
  id: string;
  name: string;
  description: string;
  recommended: boolean;
}

/**
 * A provider as the wizard shows it.
 *
 * `credentialConfigured` and `credentialSource` say whether a key is already
 * reachable — from the environment or the keychain — so someone who exported
 * one in their shell is told so rather than asked to type it again. The key
 * itself is never part of this: only whether one exists, and where from.
 */
export interface OnboardingProviderOption {
  id: CatalogProviderId;
  label: string;
  requiresApiKey: boolean;
  /** Environment variable carrying this provider's key, when it has one. */
  envName?: string;
  /** Whether this provider's key can be stored in the OS keychain. */
  supportsSecureAuth: boolean;
  credentialConfigured: boolean;
  credentialSource: ProviderCredentialSource;
  models: ProviderModelOption[];
}

export interface OnboardingStateResponse {
  /** True when the application cannot be used as it stands. */
  required: boolean;
  /** True until this version of the Desktop welcome tour has been completed once. */
  welcomeTourRequired: boolean;
  blocker?: SetupBlocker;
  providers: OnboardingProviderOption[];
  /** What the form starts on: the current configuration, or the defaults. */
  suggested: {
    provider: CatalogProviderId;
    model: string;
    profile: string;
    level: (typeof REPROMPT_LEVEL_IDS)[number];
  };
}

/**
 * Provider ids that can hold a credential, for validating a save.
 *
 * `mock` and the compatible endpoint are excluded by the main process rather
 * than here: this is the shape check, not the capability check.
 */
export const CredentialSaveRequestSchema = z
  .object({
    provider: z.enum(BUILTIN_PROVIDER_IDS),
    secret: z.string().min(1),
    /** Make the Desktop use this stored key even if its launch environment has one. */
    preferKeychain: z.boolean().optional(),
  })
  .strict();
export type CredentialSaveRequest = z.infer<typeof CredentialSaveRequestSchema>;

/**
 * What a credential save gives back: the refreshed provider statuses.
 *
 * Never the secret, and never an echo of what was sent — the renderer has no
 * use for either, and a response is the easiest place for one to leak.
 */
export interface CredentialSaveResponse {
  providers: ProviderStatus[];
}

export const OnboardingCompleteRequestSchema = z
  .object({
    provider: z.enum(BUILTIN_PROVIDER_IDS),
    model: z.string().trim().min(1),
    profile: z.string().trim().min(1),
    level: RepromptLevelSchema,
    /** La langue choisie à la configuration, enregistrée avec le reste. */
    uiLocale: z.enum(["auto", "en", "fr"]).optional(),
    compatibleProvider: z
      .object({
        id: z
          .string()
          .trim()
          .min(1)
          .regex(/^[a-z0-9-]+$/, "A provider identifier must be lowercase."),
        name: z.string().trim().min(1).optional(),
        // `.url()` alone is not enough: `localhost:11434` parses, with
        // `localhost:` as its protocol, and only fails when the first request
        // is made. The scheme is checked here instead.
        baseUrl: z
          .string()
          .trim()
          .refine(
            (value) => {
              const parsed = URL.parse(value);
              return parsed?.protocol === "http:" || parsed?.protocol === "https:";
            },
            { message: "L'URL de base doit commencer par http:// ou https://." },
          ),
        apiKeyEnv: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type OnboardingCompleteRequest = z.infer<typeof OnboardingCompleteRequestSchema>;

/**
 * The saved configuration, plus the state recomputed from it.
 *
 * Recomputed rather than assumed: saving a provider whose key never arrived
 * leaves the installation unusable, and the wizard has to say so instead of
 * closing on a success it did not achieve.
 */
export interface OnboardingCompleteResponse {
  config: SafeConfig;
  state: OnboardingStateResponse;
}

// --- Main → renderer, pushed ----------------------------------------------------

export interface RunDeltaPayload {
  runId: string;
  chunk: string;
}

export interface RunDonePayload {
  runId: string;
  result: RepromptResult;
}

export interface RunErrorPayload {
  runId: string;
  error: UiError;
}

export interface RunCancelledPayload {
  runId: string;
}

/**
 * Pushed when the capsule is (re)shown. `capture`: a selection trigger fired
 * and the stash is ready — read it through `capture:selection`. `input`:
 * free-input trigger, open on the input field.
 */
export interface CapsuleOpenedPayload {
  /**
   * Identifiant du déclenchement.
   *
   * La capsule reçoit la même ouverture par deux chemins — poussée, et tirée
   * au montage — parce qu'aucun des deux n'est fiable seul. L'identifiant lui
   * permet de n'en traiter qu'un : sans lui, une double livraison relancerait
   * une capture dont la sélection a déjà été consommée.
   */
  id: number;
  mode: "capture" | "input";
}

/**
 * La langue de l'interface et ses libellés, résolus côté main.
 *
 * Les libellés voyagent avec : le renderer ne peut pas embarquer les
 * catalogues sans dupliquer la source de vérité du CLI, et les recharger à
 * chaque écran ferait clignoter l'interface.
 */
export interface LocaleResponse {
  locale: "en" | "fr";
  messages: Record<string, string>;
}

/** L'ouverture en attente, ou `null` si la capsule n'a pas été déclenchée. */
export type CapsulePendingResponse = CapsuleOpenedPayload | null;

// Re-exported so the renderer gets fully typed payloads without ever
// importing the core, even for types (DESKTOP.md §4.2).
export type { RepromptResult, UiError };

// --- Errors ----------------------------------------------------------------------

export const DESKTOP_IPC_ERROR_CODES = {
  notImplemented: "desktop.not_implemented",
} as const;

/**
 * Raised by handlers whose channel is part of the contract but whose feature
 * lands in a later lot (capture, permissions, doctor). Typed so the renderer
 * can tell "not yet" apart from "broken".
 */
export class NotImplementedIpcError extends Error {
  readonly code = DESKTOP_IPC_ERROR_CODES.notImplemented;

  constructor(feature: string) {
    super(`${DESKTOP_IPC_ERROR_CODES.notImplemented}: ${feature}`);
    this.name = "NotImplementedIpcError";
  }
}

// --- Preload bridge ----------------------------------------------------------------

/** Unsubscribes the listener passed to an `onRun*` bridge function. */
export type Unsubscribe = () => void;

/**
 * The exact surface `preload/index.ts` exposes as `window.reqraft`: named
 * functions only, one per channel. `ipcRenderer` and any generic `invoke`
 * never cross the context bridge (DESKTOP.md §2.3).
 */
export interface ReqraftBridge {
  startReprompt(request: RepromptStartRequest): Promise<RepromptStartResponse>;
  cancelReprompt(runId: string): Promise<void>;
  captureSelection(): Promise<CaptureSelectionResponse>;
  acceptResult(runId: string, mode: ResultAcceptMode): Promise<ResultAcceptResponse>;
  readConfig(): Promise<SafeConfig>;
  writeConfig(patch: ConfigWriteRequest): Promise<SafeConfig>;
  providersStatus(): Promise<ProviderStatus[]>;
  runDoctor(): Promise<DoctorReport>;
  permissionsState(): Promise<PermissionsState>;
  requestPermissions(): Promise<PermissionsRequestResult>;
  updatesState(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<DesktopUpdateState>;
  openUpdateDownload(): Promise<void>;
  listProfiles(): Promise<ProfileSummary[]>;
  profileCatalog(): Promise<ProfileCatalogResponse>;
  readProfile(id: string): Promise<ProfileDetail>;
  saveProfile(request: ProfileSaveRequest): Promise<ProfileMutationResponse>;
  duplicateProfile(request: ProfileDuplicateRequest): Promise<ProfileMutationResponse>;
  deleteProfile(id: string): Promise<ProfileMutationResponse>;
  exportProfile(id: string): Promise<ProfileExportResponse>;
  readLocale(locale?: "en" | "fr"): Promise<LocaleResponse>;
  capsulePending(): Promise<CapsulePendingResponse>;
  openSettings(): Promise<void>;
  openWelcomeTour(): Promise<void>;
  shortcutsState(): Promise<ShortcutStateInfo>;
  onboardingState(): Promise<OnboardingStateResponse>;
  completeWelcomeTour(): Promise<OnboardingStateResponse>;
  saveCredential(request: CredentialSaveRequest): Promise<CredentialSaveResponse>;
  deleteCredential(request: CredentialDeleteRequest): Promise<CredentialSaveResponse>;
  saveProvider(request: ProviderSaveRequest): Promise<ProviderMutationResponse>;
  deleteProvider(id: string): Promise<ProviderMutationResponse>;
  completeOnboarding(request: OnboardingCompleteRequest): Promise<OnboardingCompleteResponse>;
  onRunDelta(listener: (payload: RunDeltaPayload) => void): Unsubscribe;
  onRunDone(listener: (payload: RunDonePayload) => void): Unsubscribe;
  onRunError(listener: (payload: RunErrorPayload) => void): Unsubscribe;
  onRunCancelled(listener: (payload: RunCancelledPayload) => void): Unsubscribe;
  onCapsuleOpened(listener: (payload: CapsuleOpenedPayload) => void): Unsubscribe;
}
