import { z } from "zod";
import { ReqraftError } from "./errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import {
  DEFAULT_REPROMPT_LEVEL_ID,
  REPROMPT_LEVEL_IDS,
  type RepromptLevelId,
} from "@/shared/reprompt-contract.js";

/**
 * Les niveaux viennent de `@/shared/reprompt-contract.js`, pas d'ici.
 *
 * Le renderer Desktop ne peut pas importer le cœur, et il lui faut pourtant la
 * même liste : elle vit donc dans un module neutre que les deux côtés lisent.
 * Le cœur en garde ses noms historiques et construit le schéma Zod par-dessus.
 */
export const REPROMPT_LEVELS = REPROMPT_LEVEL_IDS;
export type RepromptLevel = RepromptLevelId;
export const DEFAULT_REPROMPT_LEVEL = DEFAULT_REPROMPT_LEVEL_ID;
export const RepromptLevelSchema = z.enum(REPROMPT_LEVELS);

export function parseLevel(level: string): RepromptLevel {
  const result = RepromptLevelSchema.safeParse(level);
  if (!result.success) {
    throw new ReqraftError("level.invalid", EXIT_CODES.INVALID_INPUT, {
      params: { level, allowed: [...REPROMPT_LEVELS] },
    });
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
