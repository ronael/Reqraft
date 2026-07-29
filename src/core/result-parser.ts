import { z } from "zod";

const ResultSchema = z.object({
  rewritten: z.string().min(1),
  changes: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export interface ParsedResult {
  rewritten: string;
  changes: string[];
  warnings: string[];
  format: "structured" | "raw";
}

const FENCE_REGEX = /^```(?:json)?\s*\n?([\s\S]*?)```$/;

export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const match = FENCE_REGEX.exec(trimmed);
  if (match?.[1]) {
    return match[1].trim();
  }
  return trimmed;
}

export function parseResult(text: string): ParsedResult {
  const cleaned = stripMarkdownFences(text);

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const validated = ResultSchema.parse(parsed);
    return {
      rewritten: validated.rewritten,
      changes: validated.changes,
      warnings: validated.warnings,
      format: "structured",
    };
  } catch {
    // Fallback: treat the whole text as rewritten if JSON parsing fails.
    return {
      rewritten: cleaned,
      changes: ["Le modèle n'a pas retourné de JSON valide ; sortie brute conservée."],
      warnings: ["La réponse n’était pas structurée ; la sortie brute a été conservée."],
      format: "raw",
    };
  }
}
