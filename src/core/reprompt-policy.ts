import type { RepromptLevel } from "./types.js";

/**
 * Product policy for reprompt generation and quality analysis.
 *
 * These values are intentionally centralized because they affect cost, response
 * completeness and user-visible quality. Change them only with benchmark data
 * and update docs/reprompt-policy.md with the rationale.
 */
export const REPROMPT_POLICY = {
  runtime: {
    // Long enough for consumer networks, bounded so the CLI always returns.
    defaultTimeoutMs: 30_000,
    // Credential and setup checks should fail faster than full generations.
    connectionCheckTimeoutMs: 10_000,
    // A connectivity check only needs room for a tiny valid JSON response.
    connectionCheckMaxOutputTokens: 32,
    connectionCheckTemperature: 0,
    // Provider bodies can contain verbose internals; retain only diagnostic context.
    maxProviderErrorBodyCharacters: 200,
  },
  generation: {
    defaultTemperature: 0.2,
    // Conservative tokenizer-independent estimate used before the provider call.
    estimatedCharactersPerToken: 4,
    // Protects users from unbounded cost when a model does not publish a limit.
    fallbackModelMaxOutputTokens: 8_192,
    // Reasoning models consume part of their output budget before visible text.
    reasoningReserveTokens: 1_024,
    levels: {
      // Enough room to reproduce the source and return the JSON envelope.
      minimal: { structuralReserveTokens: 256 },
      // Allows moderate clarification and short structure around the source.
      standard: { structuralReserveTokens: 512 },
      // Allows a detailed brief while retaining the complete source intent.
      complete: { structuralReserveTokens: 1_024 },
    },
  },
  fidelity: {
    /**
     * Ce qui fait qu'un mot de la sortie est un chemin ou une commande.
     *
     * Deux listes fermées plutôt qu'une heuristique ouverte : une reformulation
     * qui invente `src/auth/session.ts` ou `pnpm run migrate` produit du
     * vérifiable, et un avertissement qui se déclenche à tort sur une phrase
     * ordinaire finit par être ignoré.
     */
    invention: {
      fileExtensions: [
        "ts",
        "tsx",
        "js",
        "jsx",
        "mjs",
        "cjs",
        "json",
        "yml",
        "yaml",
        "toml",
        "md",
        "css",
        "scss",
        "html",
        "py",
        "rb",
        "go",
        "rs",
        "java",
        "kt",
        "php",
        "sql",
        "sh",
        "bash",
        "zsh",
        "env",
        "lock",
        "cfg",
        "ini",
      ],
      commandBinaries: [
        "npm",
        "pnpm",
        "yarn",
        "bun",
        "npx",
        "git",
        "docker",
        "kubectl",
        "helm",
        "make",
        "cargo",
        "go",
        "python",
        "python3",
        "pip",
        "pip3",
        "curl",
        "wget",
        "ssh",
        "scp",
        "rsync",
        "rm",
        "mv",
        "cp",
        "chmod",
        "chown",
        "systemctl",
        "brew",
        "apt",
        "apt-get",
        "yum",
        "terraform",
        "ansible",
        "psql",
        "mysql",
        "redis-cli",
        "mongo",
        "aws",
        "gcloud",
        "az",
      ],
    },
    /**
     * Combien de structure une reformulation peut ajouter d'elle-même.
     *
     * `minimal` ne doit rien restructurer : une seule puce ajoutée est déjà un
     * changement de nature. `complete` est fait pour détailler, donc le seuil y
     * est haut — au-delà, la demande est devenue un cahier des charges.
     */
    structure: {
      levels: {
        minimal: { addedListItems: 0, addedHeadings: 0 },
        standard: { addedListItems: 4, addedHeadings: 1 },
        complete: { addedListItems: 10, addedHeadings: 3 },
      },
    },
    expansion: {
      // Higher levels intentionally allow more structure and clarification.
      levels: {
        minimal: { inputWordMultiplier: 2, structuralAllowanceWords: 15 },
        standard: { inputWordMultiplier: 4, structuralAllowanceWords: 30 },
        complete: { inputWordMultiplier: 8, structuralAllowanceWords: 80 },
      },
    },
  },
} as const;

interface OutputTokenBudgetInput {
  input: string;
  level: RepromptLevel;
  modelMaxOutputTokens?: number;
  requestedMaxOutputTokens?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

export function resolveOutputTokenBudget(input: OutputTokenBudgetInput): number {
  const generation = REPROMPT_POLICY.generation;
  const estimatedInputTokens = Math.ceil(
    input.input.length / generation.estimatedCharactersPerToken,
  );
  const levelReserve = generation.levels[input.level].structuralReserveTokens;
  const reasoningReserve =
    input.reasoningEffort && input.reasoningEffort !== "none"
      ? generation.reasoningReserveTokens
      : 0;
  const requestedBudget = estimatedInputTokens + levelReserve + reasoningReserve;
  const modelLimit = input.modelMaxOutputTokens ?? generation.fallbackModelMaxOutputTokens;

  return Math.min(input.requestedMaxOutputTokens ?? requestedBudget, modelLimit);
}
