import { ProviderError } from "../providers/errors.js";
import { theme } from "./theme/tokens.js";

/**
 * A failure presented to the user.
 *
 * Shape required by the TUI implementation brief sections 13. Never carries a stack trace, a payload,
 * a header or a key: `--verbose` puts technical detail on stderr instead.
 */
export interface UiError {
  title: string;
  message: string;
  cause?: string;
  nextAction?: string;
}

const MISSING_KEY_PATTERN = /Clé API .* manquante/;

function describeHttpStatus(status: number, provider: string): UiError {
  if (status === 401 || status === 403) {
    return {
      title: "Clé API refusée",
      message: `La clé API ${provider} a été refusée.`,
      nextAction: `Lance « rp auth login ${provider} » ou vérifie la variable d’environnement correspondante.`,
    };
  }
  if (status === 402) {
    return {
      title: "Crédit insuffisant",
      message: `Le compte ${provider} n’a plus de crédit.`,
      nextAction: "Recharge le compte provider avant de réessayer.",
    };
  }
  if (status === 429) {
    return {
      title: "Limite de requêtes atteinte",
      message: `${provider} limite temporairement les requêtes.`,
      nextAction: "Patiente quelques secondes puis régénère.",
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      title: "Provider indisponible",
      message: `${provider} est temporairement indisponible.`,
      nextAction: "Réessaie dans quelques instants.",
    };
  }
  return {
    title: "Requête refusée",
    message: `Requête refusée par ${provider} (HTTP ${String(status)}).`,
    nextAction: "Vérifie le modèle et la configuration avec « rp doctor », puis réessaie.",
  };
}

export function describeUiError(error: unknown, provider: string): UiError {
  const message = error instanceof Error ? error.message : String(error);
  const status = getProviderHttpStatus(error, message);

  if (status !== undefined) {
    // The raw body is dropped on purpose: it can echo the prompt or the key.
    return describeHttpStatus(status, provider);
  }

  if (MISSING_KEY_PATTERN.test(message)) {
    return {
      title: "Clé API absente",
      message,
      nextAction: `Lance « rp auth login ${provider} » pour la configurer.`,
    };
  }

  return { title: "Erreur", message: truncate(message) };
}

/** Flattens a UiError for surfaces that only accept a single line. */
export function formatUiError(error: unknown, provider: string): string {
  const described = describeUiError(error, provider);
  return [described.message, described.cause, described.nextAction]
    .filter((part): part is string => part !== undefined)
    .join(" ");
}

function truncate(message: string): string {
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
