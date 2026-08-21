import {
  COMMANDS,
  type CommandContext,
  type CommandDefinition,
  type CommandId,
  type KeyChord,
} from "./commands.js";

/**
 * Keyboard routing.
 *
 * One function decides what a key means, by layer, in a fixed order:
 *
 *   overlay open   -> overlay commands only
 *   editor focused -> global chords, then the editor keeps the key as text
 *   otherwise      -> global chords
 *
 * The rule that matters: a key that resolves to a command is never also
 * delivered to the editor. `routeKey` returns either a command or `insert`,
 * never both, so a shortcut cannot end up typed into the prompt.
 */

export interface KeyPress {
  ctrl: boolean;
  /** Key name: a letter, `escape`, `tab`, `shift+tab`. */
  name: string;
  /**
   * The character the key actually produced, when it produced one.
   *
   * `name` is the *key*, not its output: shift+s is named "s", and the space
   * bar is named "space". Routing text by name therefore lower-cased every
   * capital and dropped every space — invisible in a filter, wrong in a form.
   */
  text?: string;
}

export interface RoutingContext extends CommandContext {
  editorFocused: boolean;
}

export type OverlayRoute =
  | { kind: "overlay-nav"; dir: 1 | -1 }
  | { kind: "overlay-tab"; dir: 1 | -1 }
  | { kind: "overlay-select" }
  | { kind: "overlay-backspace" }
  | { kind: "overlay-type"; text: string };

export type KeyRoute =
  | { kind: "command"; id: CommandId }
  /** The key belongs to the focused editor as literal input. */
  | { kind: "insert" }
  /** Move the overlay highlight (up/down). */
  | { kind: "overlay-nav"; dir: 1 | -1 }
  /**
   * Move between the fields of an overlay that has several (Tab / Shift+Tab).
   * A list overlay has nothing to move between and ignores it.
   */
  | { kind: "overlay-tab"; dir: 1 | -1 }
  /** Confirm the highlighted overlay row. */
  | { kind: "overlay-select" }
  /** Edit the palette query (backspace or a printable character). */
  | { kind: "overlay-backspace" }
  | { kind: "overlay-type"; text: string }
  /** Nothing claims the key. */
  | { kind: "ignored" };

function matches(chord: KeyChord, key: KeyPress): boolean {
  return chord.ctrl === key.ctrl && chord.name === key.name;
}

function find(
  key: KeyPress,
  context: RoutingContext,
  scopes: readonly CommandDefinition["scope"][],
): CommandDefinition | undefined {
  return COMMANDS.find(
    (command) =>
      scopes.includes(command.scope) &&
      command.isAvailable(context) &&
      command.chords.some((chord) => matches(chord, key)),
  );
}

function routeOverlayKey(key: KeyPress, context: RoutingContext): KeyRoute {
  const command = find(key, context, ["overlay"]);
  if (command) return { kind: "command", id: command.id };

  // List navigation belongs to the open overlay. The app applies it to
  // whichever overlay is active, so routing does not need to know whether
  // the overlay is a picker or the palette.
  if (!key.ctrl && key.name === "up") return { kind: "overlay-nav", dir: -1 };
  if (!key.ctrl && key.name === "down") return { kind: "overlay-nav", dir: 1 };
  // Tab traverses a form's fields. It is routed here rather than left to the
  // `editor`-scoped `focus-next`, which must not fire while an overlay owns the
  // keyboard — and the textarea does not consume Tab, so the form can use it
  // even from the multiline field.
  if (!key.ctrl && key.name === "tab") return { kind: "overlay-tab", dir: 1 };
  if (!key.ctrl && key.name === "shift+tab") return { kind: "overlay-tab", dir: -1 };
  if (!key.ctrl && key.name === "return") return { kind: "overlay-select" };
  if (!key.ctrl && key.name === "backspace") return { kind: "overlay-backspace" };
  // The terminal names the space bar rather than reporting it as a character,
  // so a length check alone drops it — which silently made spaces untypable in
  // the palette filter and in every overlay text field.
  if (!key.ctrl && key.text !== undefined) return { kind: "overlay-type", text: key.text };

  // An overlay captures everything else: keys must not leak to the editor.
  return { kind: "ignored" };
}

function routeEditorKey(key: KeyPress, context: RoutingContext): KeyRoute {
  const editorCommand = find(key, context, ["editor"]);
  if (editorCommand) return { kind: "command", id: editorCommand.id };
  return context.editorFocused ? { kind: "insert" } : { kind: "ignored" };
}

export function routeKey(key: KeyPress, context: RoutingContext): KeyRoute {
  // Ctrl+C is the escape hatch and outranks every layer, overlays included.
  if (key.ctrl && key.name === "c") {
    return { kind: "command", id: context.isGenerating ? "cancel" : "exit" };
  }

  if (context.hasOverlay) {
    return routeOverlayKey(key, context);
  }

  const global = find(key, context, ["global"]);
  if (global) return { kind: "command", id: global.id };

  return routeEditorKey(key, context);
}
