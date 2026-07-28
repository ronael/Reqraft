import { ProviderError } from "../providers/errors.js";

export class EmptyProviderResponseError extends ProviderError {
  constructor() {
    super(
      "Le modèle a consommé la limite de sortie sans produire de texte visible. Réessaie avec un effort de raisonnement plus faible, une limite supérieure ou un modèle plus rapide.",
      5,
    );
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
