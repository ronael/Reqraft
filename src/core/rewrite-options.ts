import type { EngineOptions } from "./engine.js";

export type RewriteOptionsInput = Omit<EngineOptions, "includeChanges">;

/**
 * Surface-independent contract sent to providers.
 *
 * The CLI and TUI may choose how much metadata they display, but they must ask
 * the model with the same response shape to avoid product drift between modes.
 */
export function prepareRewriteOptions(input: RewriteOptionsInput): EngineOptions {
  return {
    ...input,
    includeChanges: true,
  };
}
