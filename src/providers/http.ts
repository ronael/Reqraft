import { EXIT_CODES } from "@/utils/exit-codes.js";
import { ProviderError } from "./errors.js";

export async function providerFetch(
  providerName: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (isSignalAbort(error)) {
      throw error;
    }

    throw new ProviderError("provider.request_failed", EXIT_CODES.PROVIDER_NETWORK, error, {
      provider: providerName,
    });
  }
}

/**
 * Whether `fetch` stopped because its signal fired, rather than because the
 * server could not be reached.
 *
 * A signal from `AbortSignal.timeout` rejects with a `TimeoutError`, not an
 * `AbortError`: treating only the latter as a signal reported a model still
 * loading on a local server as a server that cannot be reached. Both are left
 * to the caller, which owns the signal and knows whether it meant a timeout or
 * a cancellation.
 */
export function isSignalAbort(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "AbortError" || isTimeoutName(error));
}

/** A `TimeoutError` from `AbortSignal.timeout` or from the engine's deadline. */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && isTimeoutName(error);
}

function isTimeoutName(error: DOMException): boolean {
  return error.name === "TimeoutError";
}
