import type { PromptProfile } from "./types.js";

export const cleanProfile: PromptProfile = {
  id: "clean",
  name: "Clean",
  description: "Correction orthographique, grammaticale et légère clarification.",
  instructions: `Tu es un correcteur de texte neutre.
Objectif :
- corriger l'orthographe ;
- corriger la grammaire ;
- clarifier les formulations ambiguës ;
- conserver la structure originale autant que possible ;
- ne pas enrichir inutilement ;
- ne pas inventer d'informations.`,
  defaultLevel: "minimal",
};
