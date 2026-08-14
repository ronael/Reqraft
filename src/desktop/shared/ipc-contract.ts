import { z } from "zod";
import { RepromptLevelSchema } from "../../core/levels.js";
import { ConfigSchema, type Config } from "../../config/schema.js";
import type { RepromptResult } from "../../core/types.js";
import type { UiError } from "../../ui/errors.js";

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
   * The profile resolved LOCALLY at start (§8.2 `analyse` state): the capsule
   * displays it from the first frame, never a hardcoded placeholder.
   */
  profile: string;
  /** True when the profile was auto-detected rather than explicitly chosen. */
  detectedProfile: boolean;
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
 */
export type SafeCustomProviderConfig = Omit<
  NonNullable<Config["providers"]>[string],
  "customHeaders"
>;
export type SafeConfig = Omit<Config, "providers"> & {
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
  onRunDelta(listener: (payload: RunDeltaPayload) => void): Unsubscribe;
  onRunDone(listener: (payload: RunDonePayload) => void): Unsubscribe;
  onRunError(listener: (payload: RunErrorPayload) => void): Unsubscribe;
  onRunCancelled(listener: (payload: RunCancelledPayload) => void): Unsubscribe;
}
