import { ProviderError } from "../providers/errors.js";
import { theme } from "./theme/tokens.js";

export function formatUiError(error: unknown, provider: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const providerStatus = getProviderHttpStatus(error, message);
  if (providerStatus === 401 || providerStatus === 403) {
    return `Clé API ${provider} refusée. Lance « rp auth login ${provider} » ou vérifie la variable d’environnement correspondante.`;
  }
  if (providerStatus === 402) {
    return `Crédit insuffisant pour ${provider}. Recharge le compte provider avant de réessayer.`;
  }
  if (providerStatus === 429) {
    return `${provider} limite temporairement les requêtes. Patiente quelques secondes puis régénère.`;
  }
  if (providerStatus !== undefined && providerStatus >= 500 && providerStatus <= 599) {
    return `${provider} est temporairement indisponible. Réessaie dans quelques instants.`;
  }
  if (providerStatus !== undefined) {
    return `Requête refusée par ${provider} (HTTP ${String(providerStatus)}). Vérifie le modèle et la configuration avec « rp doctor », puis réessaie.`;
  }
  if (/Clé API .* manquante/.test(message)) {
    return `${message} Lance « rp auth login ${provider} » pour la configurer.`;
  }
  const limit = theme.behavior.maxErrorMessageCharacters;
  return message.length > limit ? `${message.slice(0, limit - 3)}…` : message;
}

function getProviderHttpStatus(error: unknown, message: string): number | undefined {
  if (error instanceof ProviderError) {
    return error.httpStatus;
  }
  const legacyStatus = /Provider error (\d{3})/.exec(message)?.[1];
  return legacyStatus === undefined ? undefined : Number(legacyStatus);
}
