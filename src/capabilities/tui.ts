import { COMMAND_ACTION_BY_CAPABILITY, getCommandOptions } from "@/ui/modal-options.js";

const CAPABILITY_BY_COMMAND_ACTION: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(COMMAND_ACTION_BY_CAPABILITY).map(([id, action]) => [action, id]),
);

/**
 * Inventaire des capacités exposées par la TUI, dérivé de la palette
 * (`getCommandOptions()`). `interrupt` est ajouté explicitement :
 * l'interruption par Ctrl+C (`handleInterruptKey` dans opentui/app.tsx) est
 * une capacité réelle de la TUI mais n'est pas une action de palette, donc
 * aucune dérivation structurelle ne peut la couvrir.
 */
export function listTuiCapabilities(): string[] {
  const paletteCapabilities = getCommandOptions(true).map((option) => {
    const id = CAPABILITY_BY_COMMAND_ACTION[option.value];
    if (id === undefined) {
      throw new Error(`Action de palette sans capacité associée : ${option.value}`);
    }
    return id;
  });
  return [...paletteCapabilities, "interrupt"];
}
