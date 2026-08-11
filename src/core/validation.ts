import { ReqraftError } from "./errors.js";

export class EmptyProviderResponseError extends ReqraftError {
  constructor() {
    super("result.empty", 5);
    this.name = "EmptyProviderResponseError";
  }
}

export function assertNonEmptyResult(text: string): string {
  const result = text.trim();
  if (!result) {
    throw new EmptyProviderResponseError();
  }
  return result;
}
