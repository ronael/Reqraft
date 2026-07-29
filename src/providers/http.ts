import { EXIT_CODES } from "../utils/exit-codes.js";
import { ProviderError } from "./errors.js";

export async function providerFetch(
  providerName: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new ProviderError(
      `${providerName} est inaccessible. Vérifie ta connexion réseau, la base URL du provider et réessaie.`,
      EXIT_CODES.PROVIDER_NETWORK,
      error,
    );
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
