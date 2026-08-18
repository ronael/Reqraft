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
}

export interface RoutingContext extends CommandContext {
  editorFocused: boolean;
}

export type KeyRoute =
  | { kind: "command"; id: CommandId }
  /** The key belongs to the focused editor as literal input. */
  | { kind: "insert" }
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

export function routeKey(key: KeyPress, context: RoutingContext): KeyRoute {
  // Ctrl+C is the escape hatch and outranks every layer, overlays included.
  if (key.ctrl && key.name === "c") {
    return { kind: "command", id: context.isGenerating ? "cancel" : "exit" };
  }

  if (context.hasOverlay) {
    const command = find(key, context, ["overlay"]);
    // An overlay captures everything else: keys must not leak to the editor.
    return command ? { kind: "command", id: command.id } : { kind: "ignored" };
  }

  const global = find(key, context, ["global"]);
  if (global) return { kind: "command", id: global.id };

  if (context.editorFocused) {
    // Editor-scope commands are the few plain keys the editor gives up, and
    // only while their availability rule holds (`?` on an empty prompt).
    const editorCommand = find(key, context, ["editor"]);
    if (editorCommand) return { kind: "command", id: editorCommand.id };
    return { kind: "insert" };
  }

  const editorCommand = find(key, context, ["editor"]);
  return editorCommand ? { kind: "command", id: editorCommand.id } : { kind: "ignored" };
}
