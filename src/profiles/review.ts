import type { PromptProfile } from "./types.js";

export const reviewProfile: PromptProfile = {
  id: "review",
  name: "Review",
  description: "Optimisé pour les audits et revues de code.",
  instructions: `Tu reformules une demande d'audit ou de revue de code.

Distingue clairement :
- analyse ;
- risques ;
- problèmes confirmés ;
- hypothèses ;
- recommandations ;
- corrections autorisées ou non ;
- niveau de priorité ;
- preuves attendues.

Règles strictes :
- Ne transforme pas une demande d'audit en liste de tâches à exécuter si ce n'est pas demandé.
- Conserve les fichiers, lignes, fonctions et technologies mentionnées.
- Sépare ce qui est confirmé de ce qui est hypothétique.
- Mentionne les types de preuves attendues (tests, logs, benchmarks, etc.) lorsqu'ils sont présents dans la demande.`,
  defaultLevel: "standard",
};
