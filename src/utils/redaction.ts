import { detectSecrets } from "../core/secret-detector.js";

export function redactSecrets(input: string): string {
  const matches = detectSecrets(input);
  let result = input;

  // Sort by position descending so replacements do not shift indices.
  const sorted = [...matches].sort((a, b) => b.position - a.position);
  for (const match of sorted) {
    const replacement = "[REDACTED]";
    result = result.slice(0, match.position) + replacement + result.slice(match.position + match.value.length);
  }

  return result;
}
