/**
 * Keyboard shortcut resolution for the interactive TUI.
 *
 * Key mapping is kept separate from the effects it triggers so the binding
 * table stays declarative and testable without rendering the app. `App` owns
 * the effects; this module only answers "which action does this key mean?".
 */

export type ShortcutAction =
  | "close-modal"
  | "exit"
  | "cancel"
  | "generate"
  | "reset"
  | "copy"
  | "toggle-diff"
  | "show-explain"
  | "open-profile"
  | "open-level"
  | "open-model"
  | "open-commands"
  | "open-help";

export interface ShortcutKey {
  ctrl: boolean;
  escape: boolean;
}

export interface ShortcutContext {
  hasModal: boolean;
  hasResult: boolean;
  inputLength: number;
  /** A generation is in flight, so Ctrl+C interrupts instead of quitting. */
  isGenerating: boolean;
}

/**
 * Control keys a terminal cannot deliver as a shortcut.
 *
 * Ctrl+letter is the letter's code minus 64, and four of those collide with
 * characters the terminal already means something by. Ink resolves them before
 * it ever considers a control combination, so `key.ctrl` stays false and the
 * binding is indistinguishable from the plain key:
 *
 *   Ctrl+H = 0x08 = Backspace
 *   Ctrl+I = 0x09 = Tab
 *   Ctrl+J = 0x0A = line feed
 *   Ctrl+M = 0x0D = carriage return, i.e. Enter
 *
 * Binding any of them silently does nothing, which is worse than not offering
 * the shortcut. `Ctrl+Enter` is absent for the same reason.
 */
export const RESERVED_CTRL_KEYS = new Set(["h", "i", "j", "m"]);

const CTRL_SHORTCUTS: Record<string, ShortcutAction> = {
  d: "toggle-diff",
  k: "open-commands",
  l: "open-level",
  // Ctrl+M would be Enter, so the model picker uses the "o" of "mOdèle".
  o: "open-model",
  p: "open-profile",
  r: "reset",
  y: "copy",
};

function resolveCtrlShortcut(input: string, context: ShortcutContext): ShortcutAction | null {
  // Explaining a result is only meaningful once one exists.
  if (input === "e") {
    return context.hasResult ? "show-explain" : null;
  }
  return CTRL_SHORTCUTS[input] ?? null;
}

export function resolveShortcut(
  input: string,
  key: ShortcutKey,
  context: ShortcutContext,
): ShortcutAction | null {
  // Ctrl+C is the escape hatch and must work from any state, modal included:
  // it interrupts a running generation, and quits otherwise (DA.md section 7).
  if (key.ctrl && input === "c") {
    return context.isGenerating ? "cancel" : "exit";
  }

  // Otherwise a modal captures every key: only Escape gets through.
  if (context.hasModal) {
    return key.escape ? "close-modal" : null;
  }
  if (key.ctrl) {
    return resolveCtrlShortcut(input, context);
  }
  if (key.escape) {
    return "exit";
  }
  // "?" opens help only on an empty prompt, so it stays typable otherwise.
  if (input === "?" && context.inputLength === 0) {
    return "open-help";
  }
  return null;
}
