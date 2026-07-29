export class RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Le provider n’a pas répondu dans le délai de ${String(timeoutMs)} ms.`);
    this.name = "RequestTimeoutError";
  }
}
