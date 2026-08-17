import type { Binding } from "@opentui/keymap";
import type { Renderable } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";

/**
 * Key binding tables for the interactive TUI, kept separate from the effects
 * they trigger so the binding contract stays declarative and testable without
 * a renderer. `Keymap` owns the dispatch; this module only answers "which
 * action does this key mean in this context?".
 *
 * Contexts are expressed as layers:
 *
 * - `base` (priority 0): global shortcuts. Every binding except Ctrl+C is
 *   inert while a modal is open, so a modal owns the keyboard.
 * - `modal` (priority 10): active while a modal is open. Escape closes;
 *   everything else is left to the modal's own controls (the focused
 *   renderable keeps receiving keys the keymap does not claim).
 *
 * Keys that match no binding fall through to the focused renderable — that is
 * how typing reaches the prompt without any special-casing: global bindings
 * only claim modified keys and a few unambiguous ones.
 */

export type ReqraftBinding = Binding<Renderable, KeyEvent>;

export interface KeymapConditions {
  /** A modal owns the keyboard while open. */
  modalOpen(): boolean;
  /** Result-only actions stay inert until a result exists. */
  hasResult(): boolean;
  /** "?" opens help only on an empty prompt, so it stays typable otherwise. */
  inputEmpty(): boolean;
}

export interface KeymapActions {
  interruptOrExit(): void;
  exit(): void;
  moveFocus(): void;
  generate(): void;
  openProfile(): void;
  openLevel(): void;
  openProvider(): void;
  openModel(): void;
  toggleDiff(): void;
  showExplain(): void;
  copyResult(): void;
  reset(): void;
  openHelp(): void;
  pasteFromClipboard(): void;
  closeModal(): void;
}

/**
 * Ctrl+letter is the letter's code minus 64, and four of those collapse to
 * characters the terminal already means something by (Ctrl+H = Backspace,
 * Ctrl+I = Tab, Ctrl+J = newline, Ctrl+M = Enter). Binding any of them would
 * silently do nothing, so they are not offered as shortcuts.
 */
export const RESERVED_CTRL_KEYS = new Set(["h", "i", "j", "m"]);

export function createBaseBindings(
  actions: KeymapActions,
  conditions: KeymapConditions,
): ReqraftBinding[] {
  return [
    // The escape hatch: works from any state, modal included. It interrupts a
    // running generation and quits otherwise.
    { key: "ctrl+c", cmd: actions.interruptOrExit },
    { key: "escape", cmd: actions.exit, enabled: () => !conditions.modalOpen() },
    { key: "tab", cmd: actions.moveFocus, enabled: () => !conditions.modalOpen() },
    { key: "ctrl+g", cmd: actions.generate, enabled: () => !conditions.modalOpen() },
    { key: "ctrl+p", cmd: actions.openProfile, enabled: () => !conditions.modalOpen() },
    { key: "ctrl+l", cmd: actions.openLevel, enabled: () => !conditions.modalOpen() },
    { key: "ctrl+i", cmd: actions.openProvider, enabled: () => !conditions.modalOpen() },
    { key: "ctrl+o", cmd: actions.openModel, enabled: () => !conditions.modalOpen() },
    {
      key: "ctrl+d",
      cmd: actions.toggleDiff,
      enabled: () => !conditions.modalOpen() && conditions.hasResult(),
    },
    {
      key: "ctrl+e",
      cmd: actions.showExplain,
      enabled: () => !conditions.modalOpen() && conditions.hasResult(),
    },
    {
      key: "ctrl+y",
      cmd: actions.copyResult,
      enabled: () => !conditions.modalOpen() && conditions.hasResult(),
    },
    { key: "ctrl+r", cmd: actions.reset, enabled: () => !conditions.modalOpen() },
    // Fallback for terminals without bracketed paste; native paste events are
    // handled by the input itself.
    {
      key: "ctrl+v",
      cmd: actions.pasteFromClipboard,
      enabled: () => !conditions.modalOpen(),
    },
    {
      key: "?",
      cmd: actions.openHelp,
      enabled: () => !conditions.modalOpen() && conditions.inputEmpty(),
    },
  ];
}

export const BASE_LAYER_PRIORITY = 0;
export const MODAL_LAYER_PRIORITY = 10;

export function createModalBindings(actions: KeymapActions): ReqraftBinding[] {
  return [{ key: "escape", cmd: actions.closeModal }];
}
