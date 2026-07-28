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
- produire un brief rigoureux mais fidèle ;
- structurer obligatoirement le champ rewritten avec les sections Objectif, Contraintes et À vérifier ;
- ne résous pas les informations manquantes : liste-les dans À vérifier ;
- ne compléter que ce qui est déjà présent ;
- signaler les informations réellement manquantes ;
- ne jamais inventer de décision.`;
    case "standard":
    default:
      return `Niveau standard :
- corriger et clarifier la demande ;
- ne te limite pas à corriger la grammaire lorsque la demande implique une création, une implémentation ou une conception ;
- produire un brief actionnable, directement exploitable par une IA ;
- structurer en sections courtes lorsque cela rend le prompt plus utile ;
- conserver l'intention sans inventer de données métier spécifiques ;
- rendre les contraintes visibles.`;
  }
}
