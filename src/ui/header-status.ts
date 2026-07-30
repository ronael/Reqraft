import type { StatusTone } from "./theme/types.js";

export interface HeaderStatus {
  tone: StatusTone;
  label: string;
}

export interface HeaderStatusInput {
  isLoading: boolean;
  hasError: boolean;
  hasResult: boolean;
}

/**
 * The state marker shown in the header.
 *
 * Failure wins over a stale result: keeping "terminé" next to an error message
 * would be misleading.
 */
export function getHeaderStatus(input: HeaderStatusInput): HeaderStatus {
  if (input.isLoading) {
    return { tone: "info", label: "génération" };
  }
  if (input.hasError) {
    return { tone: "danger", label: "erreur" };
  }
  if (input.hasResult) {
    return { tone: "success", label: "terminé" };
  }
  return { tone: "success", label: "prêt" };
}
