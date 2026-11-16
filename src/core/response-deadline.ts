/**
 * How long a provider may stay silent, rather than how long it may take.
 *
 * A single budget for the whole call cut a slow model off in the middle of an
 * answer it was still writing: a model on a laptop CPU streams a few tokens a
 * second, and thirty seconds of streaming is half a rewrite. Two deadlines
 * replace it:
 *
 * - **first token**: the time the provider has to start answering — the only
 *   one a non-streamed call ever meets, since its answer arrives all at once;
 * - **idle**: once it has started, the longest silence allowed between two
 *   pieces of the answer. An answer that keeps arriving is never cut.
 *
 * Silence is measured on whatever the provider sends — reasoning the user
 * never sees included — through `touch`.
 */

export type ResponseTimeoutPhase = "first_token" | "idle";

export interface ResponseDeadlineOptions {
  firstTokenMs: number;
  idleMs: number;
}

export interface ResponseDeadline {
  /** Aborted, with a `TimeoutError`, when either deadline passes. */
  readonly signal: AbortSignal;
  /** The provider sent something: from now on, only silence is timed. */
  touch(): void;
  /** Which deadline passed, once one did. */
  readonly expired: ResponseTimeoutPhase | undefined;
  /** Stops the clock; call it once the call settled, whichever way. */
  dispose(): void;
}

export function startResponseDeadline(options: ResponseDeadlineOptions): ResponseDeadline {
  const controller = new AbortController();
  let phase: ResponseTimeoutPhase = "first_token";
  let expired: ResponseTimeoutPhase | undefined;
  let lastActivity = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const arm = (delayMs: number): void => {
    timer = setTimeout(check, delayMs);
    // The pending request keeps the process alive, not the clock watching it.
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  };

  function expire(): void {
    expired = phase;
    timer = undefined;
    controller.abort(new DOMException(`No response during the ${phase} deadline`, "TimeoutError"));
  }

  function check(): void {
    if (phase === "first_token") {
      expire();
      return;
    }
    // Re-armed for the remaining time rather than reset on every fragment:
    // a stream delivers hundreds of them, and only the silence matters.
    const silence = Date.now() - lastActivity;
    if (silence >= options.idleMs) {
      expire();
    } else {
      arm(options.idleMs - silence);
    }
  }

  arm(options.firstTokenMs);

  return {
    signal: controller.signal,
    touch() {
      if (expired !== undefined || timer === undefined) return;
      lastActivity = Date.now();
      if (phase === "first_token") {
        phase = "idle";
        clearTimeout(timer);
        arm(options.idleMs);
      }
    },
    get expired() {
      return expired;
    },
    dispose() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
