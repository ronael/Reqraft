export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function raiseProviderError(response: Response, body: string): never {
  let code = 4; // network/provider default
  if (response.status === 401 || response.status === 403) {
    code = 3;
  } else if (response.status === 429) {
    code = 4;
  } else if (response.status >= 500) {
    code = 4;
  }
  throw new ProviderError(
    `Provider error ${String(response.status)}: ${body.slice(0, 200)}`,
    code,
  );
}
