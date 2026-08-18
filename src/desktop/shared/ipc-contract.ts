import { z } from "zod";
import { RepromptLevelSchema } from "@/core/levels.js";
import { ConfigSchema, type Config, type ConfigKey } from "@/config/schema.js";
import type { RepromptResult } from "@/core/types.js";
import type { UiError } from "@/shared/errors.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";

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

export type CaptureSelectionResponse = { text: string; sourceApp: string } | { empty: true };

export interface ResultAcceptResponse {
  applied: boolean;
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
};

export type ProviderCredentialSource =
  "environment" | "keychain" | "config" | "builtin" | "not_configured";

export interface ProviderStatus {
  id: string;
  configured: boolean;
  source: ProviderCredentialSource;
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

/** Registered/rejected global shortcuts, for the settings Shortcuts tab. */
export interface ShortcutStateInfo {
  registered: { accelerator: string; label: string; intent: "capture" | "input" }[];
  /** Accelerators whose registration returned false — already taken (§5.5). */
  rejected: string[];
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
  mode: "capture" | "input";
}

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
  listProfiles(): Promise<ProfileSummary[]>;
  openSettings(): Promise<void>;
  shortcutsState(): Promise<ShortcutStateInfo>;
  onRunDelta(listener: (payload: RunDeltaPayload) => void): Unsubscribe;
  onRunDone(listener: (payload: RunDonePayload) => void): Unsubscribe;
  onRunError(listener: (payload: RunErrorPayload) => void): Unsubscribe;
  onRunCancelled(listener: (payload: RunCancelledPayload) => void): Unsubscribe;
  onCapsuleOpened(listener: (payload: CapsuleOpenedPayload) => void): Unsubscribe;
}
