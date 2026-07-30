/**
 * The user interrupted the run.
 *
 * Distinct from a timeout: nothing went wrong, so the interface must not
 * present it as a failure.
 */
export class RequestCancelledError extends Error {
  constructor() {
    super("Génération interrompue.");
    this.name = "RequestCancelledError";
  }
}

export class RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Le provider n’a pas répondu dans le délai de ${String(timeoutMs)} ms.`);
    this.name = "RequestTimeoutError";
  }
}
