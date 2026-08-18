import { randomUUID } from "node:crypto";
import type { executeReprompt } from "@/application/reprompt.js";
import type { Config } from "@/config/schema.js";
import { detectSecrets } from "@/core/secret-detector.js";
import { previewRewritten } from "@/core/stream-preview.js";
import type { RepromptResult } from "@/core/types.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { AUTO_PROFILE_ID } from "@/profiles/profile-ids.js";
import { resolveProfile } from "@/profiles/registry.js";
import { describeUiError, type UiError } from "@/ui/errors.js";
import { IPC_CHANNELS } from "@/desktop/shared/ipc-channels.js";
import type { RepromptStartRequest, RepromptStartResponse } from "@/desktop/shared/ipc-contract.js";

/** Minimal slice of `WebContents`, injected so the service stays testable. */
export interface RunEventSender {
  send(channel: string, payload: unknown): void;
  isDestroyed(): boolean;
}

export interface RepromptServiceDependencies {
  executeReprompt: typeof executeReprompt;
  loadConfig: () => Promise<Config>;
  env: NodeJS.ProcessEnv;
  translator?: Translator;
  createRunId?: () => string;
  /** Macrotask scheduler, injected so tests control the kick ordering. */
  schedule?: (callback: () => void) => void;
  /** Lot 4: lifecycle notifications driving the menu-bar tray state. */
  onRunEvent?: (event: "start" | "done" | "error" | "cancelled") => void;
}

const DEFAULT_TRANSLATOR = createTranslator("fr");

/**
 * Owns the lifecycle of reprompt runs for the desktop main process.
 *
 * Every run goes through `application/reprompt.ts` — the single entry point
 * of the business engine — with streaming deltas, completion, error and
 * cancellation pushed to the renderer under the run's `runId` (DESKTOP.md
 * §8.1). Electron-free by design: the renderer endpoint is injected.
 */
export class RepromptService {
  private readonly controllers = new Map<string, AbortController>();
  private readonly results = new Map<string, RepromptResult>();
  private readonly translator: Translator;
  private readonly schedule: (callback: () => void) => void;

  constructor(private readonly dependencies: RepromptServiceDependencies) {
    this.translator = dependencies.translator ?? DEFAULT_TRANSLATOR;
    this.schedule = dependencies.schedule ?? ((callback) => setTimeout(callback, 0));
  }

  /**
   * Validates the requested profile, then starts the run in the background.
   *
   * `resolveProfile` is called for its validation and alias canonicalisation
   * only — an unknown id must reject the invoke here rather than surface later
   * as a run error. It does NOT decide what `auto` means: no local heuristic
   * resolves it anymore, so the response reports `auto` as-is and the applied
   * profile arrives with the result (`RepromptResult.profile`). Keeping a
   * single source of truth is why the response deliberately carries no guess.
   *
   * The run itself is kicked on a macrotask: the invoke response carrying the
   * runId is always delivered before the first pushed event, otherwise the
   * renderer would drop an instant failure (e.g. detected secrets) as
   * belonging to an unknown run.
   */
  async start(
    request: RepromptStartRequest,
    sender: RunEventSender,
  ): Promise<RepromptStartResponse> {
    const runId = this.dependencies.createRunId?.() ?? randomUUID();
    const controller = new AbortController();
    this.controllers.set(runId, controller);

    const config = await this.dependencies.loadConfig();
    const profileId = request.profileId ?? config.defaultProfile;
    const { profile } = resolveProfile(profileId);

    this.schedule(() => {
      void this.execute(runId, request, sender, controller, config);
    });
    return {
      runId,
      requestedProfile: profile === "auto" ? AUTO_PROFILE_ID : profile.id,
    };
  }

  /** Idempotent: cancelling an unknown or finished run is a no-op. */
  cancel(runId: string): void {
    this.controllers.get(runId)?.abort();
  }

  /** Result of a finished run, kept for `result:accept`. */
  storedResult(runId: string): RepromptResult | undefined {
    return this.results.get(runId);
  }

  private async execute(
    runId: string,
    request: RepromptStartRequest,
    sender: RunEventSender,
    controller: AbortController,
    config: Config,
  ): Promise<void> {
    const t = this.translator;
    const providerId = request.providerId ?? config.defaultProvider;
    this.dependencies.onRunEvent?.("start");
    try {
      // The local secret policy applies before any text leaves the machine,
      // exactly like the CLI path (DESKTOP.md §9).
      const secrets = detectSecrets(request.input);
      if (secrets.length > 0) {
        this.emit(sender, IPC_CHANNELS.runError, {
          runId,
          error: this.secretError(),
        });
        this.dependencies.onRunEvent?.("error");
        return;
      }

      // The renderer never sees the raw provider envelope: deltas are decoded
      // here through `previewRewritten` (core/stream-preview.ts, REUSED, not
      // rewritten — DESKTOP.md lot 3) and pushed as displayable increments.
      let raw = "";
      let sentPreviewLength = 0;
      const { result } = await this.dependencies.executeReprompt({
        input: request.input,
        profileId: request.profileId ?? config.defaultProfile,
        level: request.level ?? config.defaultLevel,
        providerId,
        requestedModel: request.model,
        defaultModel: config.defaultModel,
        env: this.dependencies.env,
        config,
        stream: true,
        fidelityMode: config.fidelityMode,
        timeoutMs: config.timeoutMs,
        maxOutputTokens: config.maxOutputTokens,
        outputLanguage: config.outputLanguage === "auto" ? undefined : config.outputLanguage,
        signal: controller.signal,
        onDelta: (chunk) => {
          raw += chunk;
          const preview = previewRewritten(raw);
          const text = preview.kind === "pending" ? "" : preview.text;
          if (text.length > sentPreviewLength) {
            this.emit(sender, IPC_CHANNELS.runDelta, {
              runId,
              chunk: text.slice(sentPreviewLength),
            });
            sentPreviewLength = text.length;
          }
        },
      });

      this.results.set(runId, result);
      this.emit(sender, IPC_CHANNELS.runDone, { runId, result });
      this.dependencies.onRunEvent?.("done");
    } catch (error) {
      if (controller.signal.aborted) {
        this.emit(sender, IPC_CHANNELS.runCancelled, { runId });
        this.dependencies.onRunEvent?.("cancelled");
        return;
      }
      this.emit(sender, IPC_CHANNELS.runError, {
        runId,
        error: describeUiError(error, providerId, t),
      });
      this.dependencies.onRunEvent?.("error");
    } finally {
      this.controllers.delete(runId);
    }
  }

  private secretError(): UiError {
    const t = this.translator;
    return {
      title: t("common.error"),
      message: t("reprompt.secretDetected"),
      nextAction: t("reprompt.secretAdvice"),
    };
  }

  /** A closed capsule must never receive another delta (DESKTOP.md §5.6). */
  private emit(sender: RunEventSender, channel: string, payload: unknown): void {
    if (!sender.isDestroyed()) {
      sender.send(channel, payload);
    }
  }
}
