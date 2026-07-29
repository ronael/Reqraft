import type { ModalType, ViewMode } from "./app-state.js";
import type { ModalCommandAction } from "./modal-options.js";

export type CommandIntent =
  | { type: "open-modal"; modal: NonNullable<ModalType> }
  | { type: "generate" }
  | { type: "copy" }
  | { type: "show-view"; view: ViewMode };

export function resolveCommandIntent(action: ModalCommandAction): CommandIntent {
  switch (action) {
    case "profile":
    case "level":
    case "provider":
    case "model":
      return { type: "open-modal", modal: action };
    case "generate":
      return { type: "generate" };
    case "copy":
      return { type: "copy" };
    case "result":
    case "diff":
    case "explain":
      return { type: "show-view", view: action };
  }
}
