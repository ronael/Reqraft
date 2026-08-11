import { REPROMPT_POLICY } from "../core/reprompt-policy.js";
import { ReqraftError, type ReqraftErrorCode } from "../core/errors.js";
import { EXIT_CODES } from "../utils/exit-codes.js";

export class ProviderError extends ReqraftError {
  readonly httpStatus?: number;

  constructor(
    message: string,
    readonly code: number,
    readonly cause?: unknown,
    options: { httpStatus?: number; provider?: string } = {},
  ) {
    const httpStatus = options.httpStatus;
    super(providerErrorCode(httpStatus), code, {
      params: {
        ...(options.provider ? { provider: options.provider } : {}),
        ...(httpStatus === undefined ? {} : { httpStatus }),
      },
      cause,
    });
    this.name = "ProviderError";
    this.message = message;
    this.httpStatus = httpStatus;
  }
}

function providerErrorCode(status: number | undefined): ReqraftErrorCode {
  if (status === 401 || status === 403) return "provider.authentication_failed";
  if (status === 402) return "provider.insufficient_credit";
  if (status === 429) return "provider.rate_limited";
  if (status !== undefined && status >= 500) return "provider.unavailable";
  return "provider.request_failed";
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

export function raiseProviderError(provider: string, response: Response, body: string): never {
  const code = resolveExitCode(response.status);
  throw new ProviderError(
    `Provider error ${String(response.status)}: ${body.slice(
      0,
      REPROMPT_POLICY.runtime.maxProviderErrorBodyCharacters,
    )}`,
    code,
    undefined,
    { httpStatus: response.status, provider },
  );
}
