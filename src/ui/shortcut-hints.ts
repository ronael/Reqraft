export interface ShortcutHint {
  keyLabel: string;
  action: string;
  /** Present but inert in the current state. */
  disabled?: boolean;
}

export interface ShortcutHintContext {
  compact: boolean;
  hasResult: boolean;
  isGenerating: boolean;
}

const RESULT_ONLY = new Set(["^D", "^E", "^Y"]);

/**
 * Shortcuts to advertise, for the current state.
 *
 * During a generation the bar collapses to the only useful action, matching
 * mockup screen 3. Otherwise result-only actions stay visible but dimmed, so
 * the bar does not reflow the moment a result appears.
 */
export function getShortcutHints(context: ShortcutHintContext): ShortcutHint[] {
  if (context.isGenerating) {
    return [{ keyLabel: "^C", action: "Interrompre" }];
  }

  const keys: [string, string][] = context.compact
    ? [
        ["Entrée", "Générer"],
        ["^K", "Actions"],
        ["^D", "Diff"],
        ["?", "Aide"],
        ["Esc", "Quitter"],
      ]
    : [
        ["Entrée", "Générer"],
        ["^K", "Actions"],
        ["^P", "Profil"],
        ["^L", "Niveau"],
        ["^O", "Modèle"],
        ["^D", "Diff"],
        ["^E", "Explication"],
        ["^Y", "Copier"],
        ["?", "Aide"],
        ["Esc", "Quitter"],
      ];

  return keys.map(([keyLabel, action]) => ({
    keyLabel,
    action,
    disabled: RESULT_ONLY.has(keyLabel) && !context.hasResult,
  }));
}
