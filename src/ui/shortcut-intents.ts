import type { ModalType, ViewMode } from "./app-state.js";
import type { ShortcutAction } from "./shortcuts.js";

/**
 * Every control-key action carries `preserveInput`, and every one of them sets
 * it: ink-text-input inserts the letter of any control combination it does not
 * filter, so the app must pin the prompt back to its pre-keystroke value.
 */
export type ShortcutIntent =
  | { type: "close-modal" }
  | { type: "exit" }
  | { type: "cancel" }
  | { type: "generate"; preserveInput: boolean }
  | { type: "copy"; preserveInput: boolean; dismissModal: boolean }
  | { type: "toggle-diff"; preserveInput: boolean }
  | { type: "show-view"; view: ViewMode; preserveInput: boolean }
  | { type: "open-modal"; modal: NonNullable<ModalType>; preserveInput: boolean };

const PRESERVE_CURRENT_INPUT = true;
const USE_SUBMITTED_INPUT = false;

function openModalIntent(modal: NonNullable<ModalType>): ShortcutIntent {
  return { type: "open-modal", modal, preserveInput: PRESERVE_CURRENT_INPUT };
}

export function resolveShortcutIntent(action: ShortcutAction): ShortcutIntent {
  switch (action) {
    case "close-modal":
      return { type: "close-modal" };
    case "exit":
      return { type: "exit" };
    case "cancel":
      return { type: "cancel" };
    case "generate":
      return { type: "generate", preserveInput: USE_SUBMITTED_INPUT };
    case "regenerate":
      return { type: "generate", preserveInput: PRESERVE_CURRENT_INPUT };
    case "copy":
      return { type: "copy", preserveInput: PRESERVE_CURRENT_INPUT, dismissModal: false };
    case "toggle-diff":
      return { type: "toggle-diff", preserveInput: PRESERVE_CURRENT_INPUT };
    case "show-explain":
      return { type: "show-view", view: "explain", preserveInput: PRESERVE_CURRENT_INPUT };
    case "open-profile":
      return openModalIntent("profile");
    case "open-level":
      return openModalIntent("level");
    case "open-model":
      return openModalIntent("model");
    case "open-commands":
      return openModalIntent("commands");
    case "open-help":
      return openModalIntent("help");
  }
}
