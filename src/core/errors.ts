export type ReqraftErrorCode =
  | "request.cancelled"
  | "request.timeout"
  | "result.empty"
  | "result.unparseable"
  | "input.missing"
  | "input.file_unreadable"
  | "clipboard.read_failed"
  | "clipboard.write_failed"
  | "config.invalid"
  | "config.value_invalid"
  | "runtime.option_invalid"
  | "alias.name_empty"
  | "alias.name_invalid"
  | "alias.name_reserved"
  | "alias.exists"
  | "alias.not_found"
  | "profile.unknown"
  | "level.invalid"
  | "provider.unsupported"
  | "provider.missing_configuration"
  | "provider.authentication_failed"
  | "provider.insufficient_credit"
  | "provider.rate_limited"
  | "provider.unavailable"
  | "provider.request_failed"
  | "credential.placeholder"
  | "credential.storage_unavailable"
  | "internal.unexpected";

export type ReqraftErrorParams = Record<string, string | number | string[]>;

export class ReqraftError extends Error {
  readonly errorCode: ReqraftErrorCode;
  readonly exitCode: number;
  readonly params?: ReqraftErrorParams;
  readonly detail?: string;

  constructor(
    errorCode: ReqraftErrorCode,
    exitCode: number,
    options: {
      params?: ReqraftErrorParams;
      detail?: string;
      cause?: unknown;
    } = {},
  ) {
    super(errorCode, { cause: options.cause });
    this.name = "ReqraftError";
    this.errorCode = errorCode;
    this.exitCode = exitCode;
    this.params = options.params;
    this.detail = options.detail;
  }
}

export class RequestCancelledError extends ReqraftError {
  constructor() {
    super("request.cancelled", 0);
    this.name = "RequestCancelledError";
  }
}

export class RequestTimeoutError extends ReqraftError {
  constructor(readonly timeoutMs: number) {
    super("request.timeout", 4, { params: { timeoutMs } });
    this.name = "RequestTimeoutError";
  }
}

export function normalizeReqraftError(error: unknown): ReqraftError {
  if (error instanceof ReqraftError) return error;
  return new ReqraftError("internal.unexpected", 1, { cause: error });
}
