import { z } from "zod";
import { RepromptLevelSchema } from "@/core/levels.js";
import {
  ConfigSchema,
  DesktopShortcutsConfigSchema,
  type Config,
  type ConfigKey,
} from "@/config/schema.js";
import type { RepromptResult } from "@/core/types.js";
import type { UiError } from "@/shared/errors.js";
import {
  CUSTOM_PROFILE_ID_MAX_LENGTH,
  CUSTOM_PROFILE_ID_REGEX,
  isValidCustomProfileId,
} from "@/profiles/custom.js";
import { AUTO_PROFILE_ID, BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";
import {
  BUILTIN_PROVIDER_IDS,
  CREDENTIAL_PROVIDER_IDS,
  OPENAI_COMPATIBLE_PROVIDER_ID,
} from "@/providers/catalog.js";
import type { SetupBlocker } from "@/config/setup.js";
import {
  FIDELITY_MODE_IDS,
  REPROMPT_LEVEL_IDS,
  type FidelityModeId,
} from "@/shared/reprompt-contract.js";

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
 * Level cycle for the capsule's ⇥ shortcut, and the fidelity scale beside it.
 *
 * Re-exported, no longer restated: both lists are declared once in
 * `@/shared/reprompt-contract.js`, which the core reads too. The renderer may
 * not import the core (§4.2), so it reads them from here — but there is only
 * one list, so there is nothing left to drift.
 */
export { REPROMPT_LEVEL_IDS, FIDELITY_MODE_IDS };
export type DesktopFidelityMode = FidelityModeId;

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

/**
 * Le plafond du texte qu'une acceptation peut porter.
 *
 * Le renderer reste non fiable, et une acceptation transporte désormais du
 * texte : il doit donc être borné ici, du côté qui décide, et pas seulement
 * dans le champ qui le produit. Cent mille caractères dépassent largement
 * toute reformulation — la sortie du modèle est elle-même bornée par
 * `maxOutputTokens` — et empêchent qu'une acceptation serve à faire transiter
 * un volume arbitraire vers le presse-papiers ou vers l'application source.
 */
export const RESULT_ACCEPT_TEXT_MAX_LENGTH = 100_000;

export const ResultAcceptRequestSchema = z
  .object({
    runId: z.string().min(1),
    mode: z.enum(RESULT_ACCEPT_MODES),
    /**
     * La version reprise à la main, absente tant que rien n'a été modifié.
     *
     * Elle voyage AVEC l'acceptation. Il n'existe volontairement aucun canal
     * pour enregistrer un texte avant de l'appliquer : il y aurait alors une
     * fenêtre entre l'enregistrement et l'acceptation pendant laquelle le
     * texte appliqué pourrait ne plus être celui qui était affiché. Ici la
     * paire « quel run » et « quel texte » arrive en un seul message, validée
     * en une seule fois.
     *
     * Un texte vide ou fait d'espaces est refusé : accepter un résultat, c'est
     * en écrire un, et remplacer une sélection par du vide est une perte, pas
     * une reformulation.
     */
    text: z
      .string()
      .min(1)
      .max(RESULT_ACCEPT_TEXT_MAX_LENGTH)
      .refine((value) => value.trim() !== "", { message: "texte vide" })
      .optional(),
  })
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

/**
 * Ce qu'un écran de réglages a le droit d'écrire, et rien d'autre.
 *
 * Le contrat était `ConfigSchema.partial()`. `ConfigSchema` est `passthrough` :
 * toute clé traversait, et `partial()` n'en retirait aucune. Un renderer — que
 * tout le reste du contrat traite comme non fiable — pouvait donc réécrire
 * `providers`, dont les en-têtes personnalisés portent un jeton
 * d'authentification, rallumer `telemetry`, ou remettre à zéro l'état que le
 * processus principal tient lui-même (parcours de bienvenue, dernière version
 * annoncée, fournisseurs à lire dans le trousseau).
 *
 * La liste ci-dessous est celle des champs que les écrans Desktop passent
 * réellement à `window.reqraft.writeConfig` : `ModelsTab` (fournisseur, modèle,
 * niveau), `ProfilesTab` (profil par défaut), `PreferencesTab` (fidélité,
 * langue de sortie, délai, tokens maximum) et `SettingsApp` (langue de
 * l'interface, raccourcis). Les autres réglages du fichier restent au CLI, et
 * les fournisseurs gardent leurs canaux dédiés (`providers:save`,
 * `providers:delete`), qui savent, eux, préserver les en-têtes.
 *
 * `strict()` refuse toute clé inconnue plutôt que de la laisser passer : un
 * champ ajouté au fichier de configuration n'est pas éditable ici tant qu'il
 * n'a pas été nommé, ce qui est le sens du refus par défaut.
 */
export const ConfigWriteRequestSchema = ConfigSchema.pick({
  defaultProvider: true,
  defaultModel: true,
  defaultProfile: true,
  defaultLevel: true,
  fidelityMode: true,
  outputLanguage: true,
  timeoutMs: true,
  maxOutputTokens: true,
  uiLocale: true,
})
  // La version stricte de la même forme : un intent inconnu sous
  // `desktopShortcuts` serait enregistré sans jamais être enregistrable.
  .extend({ desktopShortcuts: DesktopShortcutsConfigSchema.strict().optional() })
  .partial()
  .strict();
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
  desktopShortcuts?: { capture?: string; input?: string; popover?: string };
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

/**
 * Ce qui remet un contrôle en échec d'aplomb.
 *
 * Décidé par le processus principal, pas par le renderer : lui seul sait sur
 * quelle plateforme il tourne, si Wayland refuse l'injection par conception, et
 * si une combinaison est refusée par une autre application ou réclamée deux
 * fois par Reqraft. Le renderer devrait sinon deviner tout cela à partir d'un
 * `detail` traduit, ce qui casse à la première reformulation.
 *
 * Un identifiant stable, jamais une phrase : la phrase est traduite en face,
 * et le rapport copié — qui part dans une issue publique — n'en porte aucune.
 */
export const DOCTOR_REMEDIES = [
  /** macOS peut encore afficher l'invite Accessibilité. */
  "grant-accessibility",
  /** Automatisation : aucune API ne l'invite, seul le réglage système l'ouvre. */
  "grant-automation",
  /** Conséquence des deux précédentes : rien à faire ici, tout est au-dessus. */
  "grant-permissions",
  /** Wayland refuse l'injection par conception (§5.4) : mode plancher assumé. */
  "wayland-floor",
  /** Aucune combinaison enregistrée pour cette commande : en choisir une. */
  "pick-shortcut",
  /** Une autre application détient la combinaison : la libérer ou en changer. */
  "free-shortcut",
  /** Deux commandes Reqraft se disputent la même combinaison. */
  "resolve-shortcut-conflict",
  /** Les raccourcis globaux sont suspendus : les reprendre. */
  "resume-shortcuts",
  /** Configuration de fournisseur incomplète : clé ou endpoint à corriger. */
  "configure-provider",
] as const;

export type DoctorRemedy = (typeof DOCTOR_REMEDIES)[number];

export interface DoctorCheck {
  id: string;
  ok: boolean;
  detail?: string;
  /**
   * Renseigné pour les seuls contrôles en échec, et seulement quand une suite
   * concrète existe. Un échec sans remède affiche son détail et rien d'autre —
   * mieux qu'un bouton qui ne mène nulle part.
   */
  remedy?: DoctorRemedy;
}

export interface DoctorReport {
  checks: DoctorCheck[];
}

/**
 * Réponse de `doctor:copy` : la copie a eu lieu, rien d'autre.
 *
 * Le rapport lui-même n'y figure pas — le renderer l'a déjà par `doctor:run`,
 * et le renvoyer ferait exister deux copies d'un même texte dont une seule est
 * celle qui a été écrite dans le presse-papiers.
 */
export interface DoctorCopyResponse {
  copied: true;
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
 * Le volet des Réglages système que le desktop sait ouvrir.
 *
 * Deux valeurs, et rien d'autre : le renderer nomme une permission, jamais une
 * URL. Une chaîne libre passée à `shell.openExternal` ferait du renderer un
 * lanceur de schémas arbitraires (`file:`, `x-apple.systempreferences:` vers
 * n'importe quel volet) ; l'énumération garde la correspondance du côté qui
 * connaît déjà la plateforme.
 *
 * L'invite Accessibilité existe (`permissions:request`), mais macOS ne la
 * réaffiche pas après un refus, et l'Automatisation n'a aucune invite
 * déclenchable. Sans ce canal, un échec de permission n'a plus de suite dans
 * l'application — la seule réponse serait « allez voir dans les Réglages
 * système », que personne ne trouve du premier coup.
 */
export const SYSTEM_PERMISSION_PANES = ["accessibility", "automation"] as const;
export type SystemPermissionPane = (typeof SYSTEM_PERMISSION_PANES)[number];

export const OpenPermissionSettingsRequestSchema = z
  .object({ pane: z.enum(SYSTEM_PERMISSION_PANES) })
  .strict();
export type OpenPermissionSettingsRequest = z.infer<typeof OpenPermissionSettingsRequestSchema>;

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

/**
 * Same rule everywhere a provider identifier is accepted: it becomes a key in
 * the configuration file, and a mixed-case one would not match the endpoint it
 * was meant to name.
 */
const PROVIDER_ID_ERROR = "A provider identifier must be lowercase.";

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
  popover: ["Command+Control+O", "Command+Control+T", "Command+Control+U", "Command+Control+Y"],
} as const;

/**
 * What a global shortcut opens.
 *
 * `popover` is the third one: the menu-bar panel used to be reachable by
 * clicking the tray icon alone, which leaves someone working entirely from the
 * keyboard without any way in. The three lists above are disjoint by
 * construction — the settings must never offer the same combination for two
 * intents, because only one of them could answer.
 */
export type ShortcutIntent = keyof typeof SHORTCUT_PRESETS;

/** Registered/rejected global shortcuts, for the settings Shortcuts tab. */
export interface ShortcutStateInfo {
  registered: { accelerator: string; label: string; intent: ShortcutIntent }[];
  /** Accelerators whose registration returned false — already taken (§5.5). */
  rejected: string[];
  /**
   * Accelerators refused because another Reqraft intent already holds them.
   *
   * Kept apart from `rejected`: that list means "another application owns it",
   * and the answer is to free it up elsewhere. This one means the two choices
   * collide inside Reqraft, and the answer is to change one of them here — the
   * same message for both would send the user to the wrong place.
   */
  conflicts: string[];
  /** Whether Electron is temporarily ignoring every registered shortcut. */
  suspended: boolean;
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
      .regex(/^[a-z0-9-]+$/, PROVIDER_ID_ERROR),
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

/**
 * Which provider the settings want checked.
 *
 * A discriminated union rather than a bare identifier: a built-in provider is
 * one of a closed list, while a compatible endpoint is keyed by whatever the
 * user named it — and nothing stops someone naming an endpoint `anthropic`.
 * Without the discriminator the main process would have to guess which of the
 * two a request meant, and would sometimes test the wrong one.
 *
 * `mock` is absent by construction: it answers `ok` unconditionally, so
 * offering it would be a test that cannot fail. The compatible provider is
 * absent too — it is a family, and each endpoint is addressed on its own.
 */
export const PROVIDER_TEST_BUILTIN_IDS = CREDENTIAL_PROVIDER_IDS;
export type ProviderTestBuiltinId = (typeof PROVIDER_TEST_BUILTIN_IDS)[number];

export const ProviderTestRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("builtin"), id: z.enum(PROVIDER_TEST_BUILTIN_IDS) }).strict(),
  z
    .object({
      kind: z.literal("endpoint"),
      id: z
        .string()
        .trim()
        .min(1)
        .regex(/^[a-z0-9-]+$/, PROVIDER_ID_ERROR),
    })
    .strict(),
]);
export type ProviderTestRequest = z.infer<typeof ProviderTestRequestSchema>;

/**
 * What a check can conclude.
 *
 * A closed list rather than a sentence: `ProviderHealth.detail` is written by
 * the adapter and could carry anything a remote endpoint sent back, headers
 * and URLs included. The renderer gets a verdict it can translate, and the
 * wording stays in the locale catalogues where every other string lives.
 */
export const PROVIDER_TEST_OUTCOMES = [
  "ok",
  "missing_configuration",
  "invalid_configuration",
  "unreachable",
  "error",
] as const;
export type ProviderTestOutcome = (typeof PROVIDER_TEST_OUTCOMES)[number];

/**
 * The whole answer: which provider, and how it went.
 *
 * `missing` names configuration entries — an environment variable, `baseUrl` —
 * never their values, and the main process drops anything that does not look
 * like an identifier before sending it.
 */
export interface ProviderTestResponse {
  id: string;
  outcome: ProviderTestOutcome;
  missing?: string[];
}

// --- Models --------------------------------------------------------------------

/**
 * Which provider's catalogue the settings are asking for.
 *
 * The same discriminated union as `providers:test`, and for the same reason: a
 * built-in provider is one of a closed list, while a compatible endpoint is
 * keyed by whatever the user named it, and nothing stops someone naming an
 * endpoint `anthropic`. `openai-compatible` is excluded from the built-in
 * branch because it names a family — the registry builds it from the FIRST
 * entry of `providers`, so a catalogue can only be asked for one endpoint at a
 * time, through the `endpoint` branch.
 *
 * `mock` stays in: it has no `listModels`, so asking for it is how the
 * `unsupported` answer is reached rather than a case nothing can produce.
 *
 * What travels is a provider identity, nothing else. No key, no base URL, no
 * header: the main process already holds the configuration and hydrates the
 * credentials itself, and a renderer that could name an endpoint of its own
 * would be a renderer that can make the application call an arbitrary host.
 */
const ModelCatalogBuiltinIdSchema = z
  .enum(BUILTIN_PROVIDER_IDS)
  .exclude([OPENAI_COMPATIBLE_PROVIDER_ID]);

export const MODEL_CATALOG_BUILTIN_IDS = ModelCatalogBuiltinIdSchema.options;
export type ModelCatalogBuiltinId = (typeof MODEL_CATALOG_BUILTIN_IDS)[number];

export const ModelsListRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("builtin"), id: ModelCatalogBuiltinIdSchema }).strict(),
  z
    .object({
      kind: z.literal("endpoint"),
      id: z
        .string()
        .trim()
        .min(1)
        .regex(/^[a-z0-9-]+$/, PROVIDER_ID_ERROR),
    })
    .strict(),
]);
export type ModelsListRequest = z.infer<typeof ModelsListRequestSchema>;

/**
 * How many models may cross in one answer.
 *
 * A catalogue is remote data: an endpoint someone pointed the application at
 * decides how long its list is, and an unbounded one would be rendered into a
 * `<select>` the settings window cannot recover from. Two hundred is well past
 * what any provider publishes today and still a bound.
 */
export const MODEL_CATALOG_LIMIT = 200;

/**
 * How a catalogue request concluded.
 *
 * The provider-check outcomes plus `unsupported`, which is the one thing a
 * check cannot report: an adapter with no `listModels` at all. The list is
 * shared rather than copied so the two features cannot drift into describing
 * the same provider state with different words.
 */
export const MODEL_CATALOG_OUTCOMES = [...PROVIDER_TEST_OUTCOMES, "unsupported"] as const;
export type ModelCatalogOutcome = (typeof MODEL_CATALOG_OUTCOMES)[number];

/**
 * One model, as the renderer is allowed to see it.
 *
 * Deliberately not `ProviderModelOption`: that shape carries a description and
 * a recommendation, which are editorial fields the repository writes about the
 * presets it curates. A live catalogue has neither, and reusing the shape would
 * mean inventing an empty description and a `recommended: false` for every
 * model a provider publishes.
 */
export interface ModelCatalogEntry {
  id: string;
  name: string;
}

/**
 * The whole answer: which provider, how it went, and what it publishes.
 *
 * `models` is empty unless `outcome` is `ok`, and `truncated` says the
 * provider published more than `MODEL_CATALOG_LIMIT` — an honest "there are
 * more" rather than a list silently cut. `missing` names configuration entries
 * exactly as `ProviderTestResponse.missing` does, never their values.
 */
export interface ModelsListResponse {
  id: string;
  outcome: ModelCatalogOutcome;
  models: ModelCatalogEntry[];
  truncated: boolean;
  missing?: string[];
}

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
          .regex(/^[a-z0-9-]+$/, PROVIDER_ID_ERROR),
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

/**
 * La hauteur que la capsule demande pour elle-même.
 *
 * Bornée par le schéma, puis rebornée par le processus principal : le renderer
 * mesure son contenu, mais c'est le principal qui connaît la zone de travail
 * et qui décide. Les bornes du schéma sont volontairement plus larges que
 * celles du produit — elles refusent l'absurde (0, un million), pas une valeur
 * que le renderer aurait le droit de proposer.
 */
export const CapsuleResizeRequestSchema = z
  .object({ height: z.number().int().min(80).max(4000) })
  .strict();
export type CapsuleResizeRequest = z.infer<typeof CapsuleResizeRequestSchema>;

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
  /**
   * `text` n'est fourni que si le résultat a été repris dans la capsule : sans
   * lui, le processus principal applique le résultat qu'il a lui-même produit.
   */
  acceptResult(runId: string, mode: ResultAcceptMode, text?: string): Promise<ResultAcceptResponse>;
  readConfig(): Promise<SafeConfig>;
  writeConfig(patch: ConfigWriteRequest): Promise<SafeConfig>;
  providersStatus(): Promise<ProviderStatus[]>;
  runDoctor(): Promise<DoctorReport>;
  copyDoctorReport(): Promise<DoctorCopyResponse>;
  permissionsState(): Promise<PermissionsState>;
  requestPermissions(): Promise<PermissionsRequestResult>;
  /** Ouvre le volet système d'une permission nommée ; jamais une URL. */
  openPermissionSettings(pane: SystemPermissionPane): Promise<void>;
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
  /** Propose une hauteur pour la fenêtre capsule ; le principal l'arbitre. */
  resizeCapsule(height: number): Promise<void>;
  openSettings(): Promise<void>;
  openWelcomeTour(): Promise<void>;
  shortcutsState(): Promise<ShortcutStateInfo>;
  /** Lève la suspension des raccourcis globaux et rend l'état relu après coup. */
  resumeShortcuts(): Promise<ShortcutStateInfo>;
  onboardingState(): Promise<OnboardingStateResponse>;
  completeWelcomeTour(): Promise<OnboardingStateResponse>;
  saveCredential(request: CredentialSaveRequest): Promise<CredentialSaveResponse>;
  deleteCredential(request: CredentialDeleteRequest): Promise<CredentialSaveResponse>;
  saveProvider(request: ProviderSaveRequest): Promise<ProviderMutationResponse>;
  deleteProvider(id: string): Promise<ProviderMutationResponse>;
  testProvider(request: ProviderTestRequest): Promise<ProviderTestResponse>;
  listModels(request: ModelsListRequest): Promise<ModelsListResponse>;
  completeOnboarding(request: OnboardingCompleteRequest): Promise<OnboardingCompleteResponse>;
  onRunDelta(listener: (payload: RunDeltaPayload) => void): Unsubscribe;
  onRunDone(listener: (payload: RunDonePayload) => void): Unsubscribe;
  onRunError(listener: (payload: RunErrorPayload) => void): Unsubscribe;
  onRunCancelled(listener: (payload: RunCancelledPayload) => void): Unsubscribe;
  onCapsuleOpened(listener: (payload: CapsuleOpenedPayload) => void): Unsubscribe;
}
