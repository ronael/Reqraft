import { randomUUID } from "node:crypto";
import type { executeReprompt } from "../../application/reprompt.js";
import type { Config } from "../../config/schema.js";
import { detectSecrets } from "../../core/secret-detector.js";
import type { RepromptResult } from "../../core/types.js";
import { createTranslator, type Translator } from "../../i18n/translate.js";
import { describeUiError, type UiError } from "../../ui/errors.js";
import { IPC_CHANNELS } from "../shared/ipc-channels.js";
import type { RepromptStartRequest, RepromptStartResponse } from "../shared/ipc-contract.js";

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

  constructor(private readonly dependencies: RepromptServiceDependencies) {
    this.translator = dependencies.translator ?? DEFAULT_TRANSLATOR;
  }

  /** Starts a run in the background; progress is pushed to `sender`. */
  start(request: RepromptStartRequest, sender: RunEventSender): RepromptStartResponse {
    const runId = this.dependencies.createRunId?.() ?? randomUUID();
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    void this.execute(runId, request, sender, controller);
    return { runId };
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
  ): Promise<void> {
    const t = this.translator;
    let providerId = request.providerId ?? "provider";
    // Yield once so the invoke response carrying the runId is always
    // delivered before the first pushed event — otherwise the renderer would
    // drop an instant failure (e.g. detected secrets) as belonging to an
    // unknown run.
    await Promise.resolve();
    try {
      // The local secret policy applies before any text leaves the machine,
      // exactly like the CLI path (DESKTOP.md §9).
      const secrets = detectSecrets(request.input);
      if (secrets.length > 0) {
        this.emit(sender, IPC_CHANNELS.runError, {
          runId,
          error: this.secretError(),
        });
        return;
      }

      const config = await this.dependencies.loadConfig();
      providerId = request.providerId ?? config.defaultProvider;

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
          this.emit(sender, IPC_CHANNELS.runDelta, { runId, chunk });
        },
      });

      this.results.set(runId, result);
      this.emit(sender, IPC_CHANNELS.runDone, { runId, result });
    } catch (error) {
      if (controller.signal.aborted) {
        this.emit(sender, IPC_CHANNELS.runCancelled, { runId });
        return;
      }
      this.emit(sender, IPC_CHANNELS.runError, {
        runId,
        error: describeUiError(error, providerId, t),
      });
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
