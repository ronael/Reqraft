import {
  COMMANDS_BY_ID,
  type CommandDefinition,
  type CommandContext,
  type CommandId,
} from "./commands.js";

/**
 * Which shortcuts the footer should advertise, for a given context.
 *
 * The registry stays the single source of truth for chords and labels, but
 * showing every command at once is useless — and worse, it can advertise the
 * same key twice (`^C Interrupt` and `^C Quit`). This selector picks a small,
 * contextually relevant set, chosen by *intent* rather than by position in the
 * registry.
 *
 * Result actions (copy, diff, explain) are deliberately excluded here: they
 * live beside the result itself, so repeating them in the footer would be
 * duplication.
 */
export function statusBarCommands(context: CommandContext): CommandDefinition[] {
  const ids: CommandId[] = ["open-palette", "focus-next"];
  if (context.isGenerating) {
    ids.unshift("cancel");
  } else if (context.hasResult) {
    ids.unshift("generate", "reset");
  } else {
    ids.unshift("generate");
    ids.push("open-help");
  }

  return ids
    .map((id) => COMMANDS_BY_ID.get(id))
    .filter((command): command is CommandDefinition => command !== undefined);
}
