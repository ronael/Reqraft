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
  | "generate"
  | "regenerate"
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
}

const CTRL_SHORTCUTS: Record<string, ShortcutAction> = {
  "\r": "generate",
  c: "exit",
  d: "toggle-diff",
  k: "open-commands",
  l: "open-level",
  m: "open-model",
  p: "open-profile",
  r: "regenerate",
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
  // A modal captures every key: only Escape gets through, to dismiss it.
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
