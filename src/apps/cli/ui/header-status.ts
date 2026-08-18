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
export const HEADER_BASELINE = "Shape the request. Keep the intent.";

export interface HeaderLayout {
  showBaseline: boolean;
  showModel: boolean;
}

/**
 * What the header can afford at this width.
 *
 * A layout mode is too coarse here: `wide` starts at 76 columns but the full
 * header needs closer to 96 with a long model identifier, and Ink clips the
 * product name rather than the decoration when it overflows. Metadata is
 * therefore dropped by measuring, baseline first, then the model — the
 * priority order: the baseline goes first, the model second.
 */
export function getHeaderLayout(
  width: number,
  identity: string,
  provider: string,
  model: string,
  statusLabel: string,
): HeaderLayout {
  const SEPARATOR = 3;
  const fixed = identity.length + provider.length + statusLabel.length + 2 + SEPARATOR;
  const withModel = fixed + SEPARATOR + model.length;
  const showModel = withModel <= width;
  const used = showModel ? withModel : fixed;

  return {
    showModel,
    showBaseline: used + SEPARATOR + HEADER_BASELINE.length <= width,
  };
}

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
