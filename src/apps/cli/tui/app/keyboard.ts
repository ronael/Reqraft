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
export function toKeyPress(event: TerminalKeyEvent): KeyPress {
  if (event.name === "tab" && event.shift) {
    return { ctrl: false, name: "shift+tab" };
  }
  return { ctrl: event.ctrl, name: event.name };
}
