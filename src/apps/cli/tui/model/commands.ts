import { RESERVED_CTRL_KEYS } from "@/apps/cli/ui/shortcuts.js";
import type { MessageParameters } from "@/i18n/translate.js";

/**
 * Message keys that take no parameters. Command labels are plain strings, and
 * typing them this way lets a caller write `t(command.labelKey)` without the
 * translator demanding an argument object.
 */
export type CommandLabelKey = {
  [Key in keyof MessageParameters]: MessageParameters[Key] extends undefined ? Key : never;
}[keyof MessageParameters];

/**
 * The single registry of what the TUI can do.
 *
 * Keyboard routing, the status bar, the help overlay and the command palette
 * all read this table. That is the point: a shortcut and its advertised label
 * cannot drift apart, because there is only one place to change either.
 *
 * Pure data and pure predicates — no React, no OpenTUI — so the whole thing is
 * testable without a renderer.
 */

export type CommandId =
  | "generate"
  | "cancel"
  | "copy"
  | "reset"
  | "toggle-diff"
  | "show-explain"
  | "open-profile"
  | "open-level"
  | "open-model"
  | "open-palette"
  | "open-help"
  | "focus-next"
  | "focus-previous"
  | "close-overlay"
  | "exit";

/**
 * Where a command is allowed to fire.
 *
 * `global` survives editor focus, which is only safe for chords a terminal
 * cannot deliver as text. `editor` commands are the ones the text editor
 * itself consumes. `overlay` commands exist only while one is open.
 */
export type CommandScope = "global" | "editor" | "overlay";

export interface KeyChord {
  ctrl: boolean;
  /** Key name as reported by the terminal: a letter, or `escape` / `tab`. */
  name: string;
}

export interface CommandContext {
  hasOverlay: boolean;
  hasResult: boolean;
  isGenerating: boolean;
  inputLength: number;
}

export interface CommandDefinition {
  id: CommandId;
  chords: KeyChord[];
  /** i18n key; the label is never stored in English here. */
  labelKey: CommandLabelKey;
  scope: CommandScope;
  isAvailable: (context: CommandContext) => boolean;
}

const always = (): boolean => true;

/** Rendered form of a chord, e.g. `^G`. Derived so the footer cannot lie. */
export function formatChord(chord: KeyChord): string {
  if (chord.name === "escape") return "esc";
  if (chord.name === "tab") return chord.ctrl ? "^Tab" : "Tab";
  return chord.ctrl ? `^${chord.name.toUpperCase()}` : chord.name;
}

/** Display label for a command's primary chord. */
export function commandKeyLabel(command: CommandDefinition): string {
  const [chord] = command.chords;
  return chord ? formatChord(chord) : "";
}

const ctrl = (name: string): KeyChord => ({ ctrl: true, name });
const plain = (name: string): KeyChord => ({ ctrl: false, name });

export const COMMANDS: readonly CommandDefinition[] = [
  {
    id: "generate",
    chords: [ctrl("g")],
    labelKey: "tui.command.generate",
    scope: "global",
    isAvailable: (context) => context.inputLength > 0 && !context.isGenerating,
  },
  {
    id: "cancel",
    chords: [ctrl("c")],
    labelKey: "tui.command.cancel",
    scope: "global",
    isAvailable: (context) => context.isGenerating,
  },
  {
    id: "exit",
    chords: [ctrl("c")],
    labelKey: "tui.command.exit",
    scope: "global",
    isAvailable: (context) => !context.isGenerating,
  },
  {
    id: "copy",
    chords: [ctrl("y")],
    labelKey: "tui.command.copy",
    scope: "global",
    isAvailable: (context) => context.hasResult,
  },
  {
    id: "reset",
    chords: [ctrl("r")],
    labelKey: "tui.command.reset",
    scope: "global",
    isAvailable: always,
  },
  {
    id: "toggle-diff",
    chords: [ctrl("d")],
    labelKey: "tui.command.toggleDiff",
    scope: "global",
    isAvailable: (context) => context.hasResult,
  },
  {
    id: "show-explain",
    chords: [ctrl("e")],
    labelKey: "tui.command.explain",
    scope: "global",
    isAvailable: (context) => context.hasResult,
  },
  {
    id: "open-profile",
    chords: [ctrl("p")],
    labelKey: "tui.command.profile",
    scope: "global",
    isAvailable: always,
  },
  {
    id: "open-level",
    chords: [ctrl("l")],
    labelKey: "tui.command.level",
    scope: "global",
    isAvailable: always,
  },
  {
    // Ctrl+M is Enter at the byte level, so the model picker uses the "o".
    id: "open-model",
    chords: [ctrl("o")],
    labelKey: "tui.command.model",
    scope: "global",
    isAvailable: always,
  },
  {
    id: "open-palette",
    chords: [ctrl("k")],
    labelKey: "tui.command.palette",
    scope: "global",
    isAvailable: always,
  },
  {
    // Plain "?" would otherwise be swallowed as text, so it only fires on an
    // empty prompt. The chord stays advertised because that is when it helps.
    id: "open-help",
    chords: [plain("?")],
    labelKey: "tui.command.help",
    scope: "editor",
    isAvailable: (context) => context.inputLength === 0,
  },
  {
    id: "focus-next",
    chords: [plain("tab")],
    labelKey: "tui.command.focusNext",
    scope: "editor",
    isAvailable: always,
  },
  {
    id: "focus-previous",
    chords: [{ ctrl: false, name: "shift+tab" }],
    labelKey: "tui.command.focusPrevious",
    scope: "editor",
    isAvailable: always,
  },
  {
    id: "close-overlay",
    chords: [plain("escape")],
    labelKey: "tui.command.close",
    scope: "overlay",
    isAvailable: (context) => context.hasOverlay,
  },
] as const;

export const COMMANDS_BY_ID: ReadonlyMap<CommandId, CommandDefinition> = new Map(
  COMMANDS.map((command) => [command.id, command]),
);

export function availableCommands(context: CommandContext): CommandDefinition[] {
  return COMMANDS.filter((command) => command.isAvailable(context));
}

/**
 * Chords a terminal cannot deliver, as documented in `ui/shortcuts.ts`.
 * Exposed so a test can assert the registry never binds one — a silent no-op
 * is worse than an absent shortcut.
 */
export function reservedChords(): CommandDefinition[] {
  return COMMANDS.filter((command) =>
    command.chords.some((chord) => chord.ctrl && RESERVED_CTRL_KEYS.has(chord.name)),
  );
}
