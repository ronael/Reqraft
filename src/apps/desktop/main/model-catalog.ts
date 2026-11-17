import { MODEL_CATALOG_LIMIT, type ModelCatalogEntry } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Names a model identifier may take before it is allowed across the bridge.
 *
 * A catalogue is remote data. Whatever an endpoint returns lands in a `<select>`
 * and, once chosen, in the user's configuration file — so what crosses has to
 * look like an identifier, not like a sentence, a URL or a newline. Anything
 * that does not is dropped rather than repaired: a model whose id we had to fix
 * is a model the provider would not have accepted back.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][\w./:@-]{0,127}$/;

/** Longest display name kept. Past this it is prose, not a name. */
const MODEL_NAME_MAX_LENGTH = 80;

/**
 * A catalogue, reduced to what may be shown.
 *
 * Exported for its own test: every rule here exists because the input is
 * written by a remote endpoint. Ids that do not look like identifiers go, ids
 * repeated go — a provider listing the same model twice would otherwise give
 * React two options with the same key — and the list is capped, with
 * `truncated` saying so instead of the tail disappearing in silence.
 */
export function sanitizeModelCatalog(models: unknown): {
  models: ModelCatalogEntry[];
  truncated: boolean;
} {
  if (!Array.isArray(models)) {
    return { models: [], truncated: false };
  }

  const sanitized: ModelCatalogEntry[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const model of models) {
    const candidate = modelCatalogCandidate(model);
    if (candidate !== undefined && !seen.has(candidate.id)) {
      seen.add(candidate.id);
      if (sanitized.length >= MODEL_CATALOG_LIMIT) {
        // Known to exist, deliberately not carried: the answer says the list
        // was cut rather than pretending this was all of it.
        truncated = true;
      } else {
        sanitized.push(candidate);
      }
    }
  }

  return { models: sanitized, truncated };
}

function modelCatalogCandidate(value: unknown): ModelCatalogEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  return MODEL_ID_PATTERN.test(id) ? { id, name: cleanModelName(record.name, id) } : undefined;
}

/** A display name flattened to one line, or the id when nothing is left. */
function cleanModelName(name: unknown, fallback: string): string {
  if (typeof name !== "string") return fallback;
  const flattened = name
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MODEL_NAME_MAX_LENGTH)
    .trim();
  return flattened === "" ? fallback : flattened;
}
