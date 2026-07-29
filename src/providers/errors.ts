import { REPROMPT_POLICY } from "../core/reprompt-policy.js";
import { EXIT_CODES } from "../utils/exit-codes.js";

export class ProviderError extends Error {
  readonly httpStatus?: number;

  constructor(
    message: string,
    readonly code: number,
    readonly cause?: unknown,
    options: { httpStatus?: number } = {},
  ) {
    super(message);
    this.name = "ProviderError";
    this.httpStatus = options.httpStatus;
  }
}

/**
 * Maps an HTTP status to a CLI exit code.
 *
 * 401 and 403 are the only statuses that require a distinct action from the
 * user (re-authenticate). Rate limiting and 5xx are deliberately reported as
 * PROVIDER_NETWORK: they are transient and share the same remediation, retry.
 */
function resolveExitCode(status: number): number {
  if (status === 401 || status === 403) {
    return EXIT_CODES.AUTHENTICATION;
  }
  return EXIT_CODES.PROVIDER_NETWORK;
}

export function raiseProviderError(response: Response, body: string): never {
  const code = resolveExitCode(response.status);
  throw new ProviderError(
    `Provider error ${String(response.status)}: ${body.slice(
      0,
      REPROMPT_POLICY.runtime.maxProviderErrorBodyCharacters,
    )}`,
    code,
    undefined,
    { httpStatus: response.status },
  );
}
