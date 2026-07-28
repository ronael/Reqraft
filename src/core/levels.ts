import { z } from "zod";
import type { RepromptLevel } from "./types.js";

export const RepromptLevelSchema = z.enum(["minimal", "standard", "complete"]);

export function parseLevel(level: string): RepromptLevel {
  const result = RepromptLevelSchema.safeParse(level);
  if (!result.success) {
    throw new Error(`Niveau invalide : ${level}. Choix : minimal, standard, complete.`);
  }
  return result.data;
}

export function describeLevel(level: RepromptLevel): string {
  switch (level) {
    case "minimal":
      return `Niveau minimal :
- corriger les fautes ;
- améliorer légèrement la syntaxe ;
- conserver la structure ;
- ne presque rien ajouter.`;
    case "complete":
      return `Niveau complet :
- produire un brief rigoureux ;
- séparer objectif, contexte, actions, contraintes et validations ;
- ne compléter que ce qui est déjà présent ;
- signaler les informations réellement manquantes ;
- ne jamais inventer de décision.`;
    case "standard":
    default:
      return `Niveau standard :
- corriger ;
- clarifier ;
- structurer ;
- réduire les ambiguïtés ;
- préserver la taille réelle de la demande ;
- rendre les contraintes visibles.`;
  }
}
