import type { PromptProfile } from "./types.js";

export const debugProfile: PromptProfile = {
  id: "debug",
  name: "Debug",
  description: "Optimisé pour l'analyse et la correction de bugs.",
  instructions: `Tu reformules une demande de débogage sans inventer de cause.
Structure :
- comportement observé ;
- comportement attendu ;
- contexte ;
- reproduction ;
- messages d'erreur ;
- fichiers ou fonctionnalités concernés ;
- contraintes ;
- analyse demandée ;
- correction demandée ;
- tests de non-régression.`,
  defaultLevel: "standard",
};
