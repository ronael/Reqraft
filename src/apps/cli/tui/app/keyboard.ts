import type { KeyPress } from "@/apps/cli/tui/model/keymap.js";

/**
 * OpenTUI key events, in the model's vocabulary.
 *
 * Kept separate from the React binding so the translation itself is testable
 * without a renderer, and so `routeKey` never learns what a `ParsedKey` is.
 * This is the whole adapter: everything downstream is pure.
 */

/** The slice of OpenTUI's `ParsedKey` this layer needs. */
export interface TerminalKeyEvent {
  name: string;
  ctrl: boolean;
  shift: boolean;
  sequence?: string;
}

/**
 * Shift+Tab arrives as its own key name in the model, because the ring walks
 * backwards on it. Everything else keeps the terminal's own name.
 */
/**
 * A single printable character, or `undefined` for a key that produces none.
 *
 * The sequence is what the terminal actually emitted, so it carries the case
 * and the space that `name` normalises away. Control sequences are longer than
 * one character, or are C0 codes, and are excluded here rather than downstream.
 */
function printableText(event: TerminalKeyEvent): string | undefined {
  const sequence = event.sequence;
  if (event.ctrl || sequence === undefined) return undefined;
  const code = sequence.codePointAt(0);
  if (code === undefined || code < 0x20 || code === 0x7f) return undefined;
  // One code point, compared by length rather than by decomposing the string:
  // a surrogate pair is two UTF-16 units but a single character.
  return String.fromCodePoint(code) === sequence ? sequence : undefined;
}

export function toKeyPress(event: TerminalKeyEvent): KeyPress {
  if (event.name === "tab" && event.shift) {
    return { ctrl: false, name: "shift+tab" };
  }
  return { ctrl: event.ctrl, name: event.name, text: printableText(event) };
}
