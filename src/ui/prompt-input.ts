/**
 * What pressing Enter in the prompt field means.
 *
 * `Ctrl+Enter` cannot be used to separate the two intentions: nearly every
 * terminal emulator sends the same byte for Enter and Ctrl+Enter, with no
 * modifier flag, so they are indistinguishable without the Kitty keyboard
 * protocol. A trailing backslash marks a continuation instead, the convention
 * shells and agent CLIs already use.
 */
export type SubmitOutcome =
  { type: "newline"; input: string } | { type: "generate"; input: string };

const LINE_CONTINUATION = "\\";

export function resolveSubmit(input: string): SubmitOutcome {
  if (input.endsWith(LINE_CONTINUATION)) {
    // The backslash is an editing mark, never part of the prompt.
    return { type: "newline", input: `${input.slice(0, -1)}\n` };
  }
  return { type: "generate", input };
}

/** Line and word counts shown in the input panel header. */
export function describeInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    return "0 ligne";
  }

  const lines = input.split("\n").length;
  const words = trimmed.split(/\s+/).length;
  const lineLabel = lines > 1 ? `${String(lines)} lignes` : "1 ligne";
  const wordLabel = words > 1 ? `${String(words)} mots` : "1 mot";
  return `${lineLabel} · ${wordLabel}`;
}
