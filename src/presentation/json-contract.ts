import type { RepromptResult } from "@/core/types.js";
import type { ReqraftError } from "@/core/errors.js";

export const JSON_SCHEMA_VERSION = 1 as const;

export interface JsonSuccessEnvelope {
  schemaVersion: typeof JSON_SCHEMA_VERSION;
  ok: true;
  result: RepromptResult;
}

export function serializeJsonSuccess(result: RepromptResult): string {
  const envelope: JsonSuccessEnvelope = {
    schemaVersion: JSON_SCHEMA_VERSION,
    ok: true,
    result,
  };
  return JSON.stringify(envelope, null, 2);
}

export interface JsonErrorEnvelope {
  schemaVersion: typeof JSON_SCHEMA_VERSION;
  ok: false;
  error: {
    code: ReqraftError["errorCode"];
    params?: NonNullable<ReqraftError["params"]>;
    exitCode: number;
  };
}

export function serializeJsonError(error: ReqraftError): string {
  const envelope: JsonErrorEnvelope = {
    schemaVersion: JSON_SCHEMA_VERSION,
    ok: false,
    error: {
      code: error.errorCode,
      ...(error.params ? { params: error.params } : {}),
      exitCode: error.exitCode,
    },
  };
  return JSON.stringify(envelope, null, 2);
}
