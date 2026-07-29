import { theme } from "./theme/tokens.js";

export function formatUiError(error: unknown, provider: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Provider error (401|403)/.test(message)) {
    return `Clé API ${provider} refusée. Lance « rp auth login ${provider} » ou vérifie la variable d’environnement correspondante.`;
  }
  if (message.includes("Provider error 402")) {
    return `Crédit insuffisant pour ${provider}. Recharge le compte provider avant de réessayer.`;
  }
  if (message.includes("Provider error 429")) {
    return `${provider} limite temporairement les requêtes. Patiente quelques secondes puis régénère.`;
  }
  if (/Provider error 5\d\d/.test(message)) {
    return `${provider} est temporairement indisponible. Réessaie dans quelques instants.`;
  }
  const providerStatus = /Provider error (\d{3})/.exec(message)?.[1];
  if (providerStatus) {
    return `Requête refusée par ${provider} (HTTP ${providerStatus}). Vérifie le modèle et la configuration avec « rp doctor », puis réessaie.`;
  }
  if (/Clé API .* manquante/.test(message)) {
    return `${message} Lance « rp auth login ${provider} » pour la configurer.`;
  }
  const limit = theme.behavior.maxErrorMessageCharacters;
  return message.length > limit ? `${message.slice(0, limit - 3)}…` : message;
}
