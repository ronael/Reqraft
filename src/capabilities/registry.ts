/**
 * Registre de capacités — déclaration unique de ce que le produit sait faire.
 *
 * Chaque surface (CLI, TUI, desktop) consomme ce registre et le rend à sa
 * manière. Les tests de `tests/unit/capabilities.test.ts` échouent si une
 * surface omet une capacité déclarée ou en expose une hors registre.
 * Référence normative : `docs/internal/CAPABILITIES.md`.
 *
 * L'ordre des entrées pilote l'ordre de la palette TUI : ne pas réordonner
 * sans vérifier `getCommandOptions()`.
 */

export type Surface = "cli" | "tui" | "desktop";

export interface Capability {
  /** Identifiant stable, jamais traduit, jamais renommé. */
  id: string;
  /** Libellé utilisateur, en français. */
  label: string;
  /** Une phrase, affichée en aide et en description. */
  description: string;
  /** Surfaces sur lesquelles la capacité doit apparaître. */
  surfaces: Surface[];
  /** N'a de sens qu'une fois un résultat produit. */
  requiresResult?: boolean;
  /** Option de ligne de commande, quand la surface CLI est concernée. */
  cliFlag?: string;
}

export const CAPABILITIES: Capability[] = [
  {
    id: "reformulate",
    label: "Générer ou régénérer",
    description: "Transformer une demande brute en un prompt clair et exploitable.",
    surfaces: ["cli", "tui", "desktop"],
    // Pas de cliFlag : action par défaut de la commande racine (argument [text]).
  },
  {
    id: "select-profile",
    label: "Changer de profil",
    description: "Choisir le profil de reformulation à appliquer.",
    surfaces: ["cli", "tui", "desktop"],
    cliFlag: "--profile",
  },
  {
    id: "select-level",
    label: "Changer de niveau",
    description: "Choisir le niveau de détail de la reformulation.",
    surfaces: ["cli", "tui", "desktop"],
    cliFlag: "--level",
  },
  {
    id: "select-provider",
    label: "Changer de provider",
    description: "Choisir le fournisseur de modèle à interroger.",
    surfaces: ["cli", "tui", "desktop"],
    cliFlag: "--provider",
  },
  {
    id: "select-model",
    label: "Changer de modèle",
    description: "Choisir le modèle utilisé pour la reformulation.",
    surfaces: ["cli", "tui", "desktop"],
    cliFlag: "--model",
  },
  {
    // Ajout par rapport au tableau §4 de CAPABILITIES.md : la palette TUI
    // l'expose déjà et le test symétrique l'exige. Le CLI affiche le résultat
    // par défaut, il n'a donc ni flag dédié ni la surface « cli ».
    id: "show-result",
    label: "Afficher le résultat",
    description: "Revenir au prompt reformulé produit par la dernière génération.",
    surfaces: ["tui", "desktop"],
    requiresResult: true,
  },
  {
    id: "show-diff",
    label: "Afficher le diff",
    description: "Comparer le texte d'origine et le prompt reformulé.",
    surfaces: ["cli", "tui", "desktop"],
    requiresResult: true,
    cliFlag: "--diff",
  },
  {
    // Pas de « desktop » : la capsule affiche le verdict de fidélité et le
    // diff, pas la liste des modifications (`changes`) — la maquette §4.3 ne
    // la prévoit pas et l'ajouter encombrerait la surface signature.
    id: "show-explain",
    label: "Afficher l'explication",
    description: "Décrire les modifications apportées au texte d'origine.",
    surfaces: ["cli", "tui"],
    requiresResult: true,
    cliFlag: "--explain",
  },
  {
    id: "copy-result",
    label: "Copier le résultat",
    description: "Copier le prompt reformulé dans le presse-papiers.",
    surfaces: ["cli", "tui", "desktop"],
    requiresResult: true,
    cliFlag: "--copy",
  },
  {
    // Le tableau §4 déclarait aussi « tui », mais la TUI n'affiche aucune
    // statistique : « tui » est retiré plutôt que d'ajouter une entrée à la
    // palette, ce qui changerait le comportement visible de la TUI.
    id: "show-stats",
    label: "Afficher les statistiques",
    description: "Afficher durée, tokens et coût estimé de la génération.",
    surfaces: ["cli", "desktop"],
    cliFlag: "--stats",
  },
  {
    // Pas de « tui » : la détection et le masquage de secrets n'existent que
    // dans le chemin non interactif (commands/reprompt.ts). Exposer l'option
    // dans la TUI demanderait d'abord d'y construire toute la politique de
    // masquage — hors périmètre d'un simple branchement de palette.
    id: "redact-secrets",
    label: "Masquer les secrets détectés",
    description: "Masquer automatiquement les secrets détectés avant l'envoi.",
    surfaces: ["cli", "desktop"],
    cliFlag: "--redact-secrets",
  },
  {
    id: "fail-on-quality",
    label: "Échouer si la qualité est insuffisante",
    description: "Retourner un code d'erreur quand le résultat est à revoir.",
    surfaces: ["cli"],
    cliFlag: "--fail-on-quality",
  },
  {
    id: "json-output",
    label: "Produire une sortie JSON",
    description: "Sérialiser le résultat en JSON pour l'usage scripté.",
    surfaces: ["cli"],
    cliFlag: "--json",
  },
  {
    id: "replace-in-place",
    label: "Remplacer la sélection en place",
    description: "Remplacer le texte sélectionné par le prompt reformulé.",
    surfaces: ["desktop"],
  },
  {
    // Pas de cliFlag : interrompre n'a pas de sens en non interactif. Dans la
    // TUI, l'interruption passe par Ctrl+C (handleInterruptKey dans
    // opentui/app.tsx), pas par la palette.
    id: "interrupt",
    label: "Interrompre la génération",
    description: "Annuler la génération en cours.",
    surfaces: ["tui", "desktop"],
  },
];
