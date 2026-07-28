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
- preuves attendues.`,
  defaultLevel: "standard",
};
