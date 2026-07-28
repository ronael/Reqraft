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
- Le niveau minimal est prioritaire sur le profil.
- corriger les fautes ;
- améliorer légèrement la syntaxe ;
- conserver la structure ;
- ne presque rien ajouter ;
- pour une demande courte, produire une seule phrase courte.`;
    case "complete":
      return `Niveau complet :
- produire un brief rigoureux mais fidèle ;
- utiliser les sections Objectif, Contraintes et À vérifier uniquement lorsque la demande est complexe ou réellement sous-spécifiée ;
- pour une action triviale, rester concis et signaler seulement l'information manquante qui bloque l'exécution ;
- ne résous pas les informations manquantes avec des décisions inventées ;
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
