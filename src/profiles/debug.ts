import type { PromptProfile } from "./types.js";

export const debugProfile: PromptProfile = {
  id: "debug",
  name: "Debug",
  description: "Optimisé pour l'analyse et la correction de bugs.",
  instructions: `Tu reformules une demande de débogage.

Structure la reformulation autour de :
- comportement observé ;
- comportement attendu ;
- contexte technique ;
- étapes de reproduction ;
- messages d'erreur ;
- fichiers ou fonctionnalités concernés ;
- contraintes ;
- analyse demandée ;
- correction demandée ;
- tests de non-régression.

Règles strictes :
- Ne invente jamais de cause racine.
- Ne propose pas de correction si elle n'est pas demandée explicitement.
- Conserve les messages d'erreur, stack traces et versions tels quels.
- Distingue clairement ce qui est observé de ce qui est supposé.`,
  defaultLevel: "standard",
};
