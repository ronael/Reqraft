/**
 * Les deux échelles que toutes les surfaces nomment, écrites une seule fois.
 *
 * Le niveau de reprompting et le mode de fidélité sont des valeurs de produit :
 * elles apparaissent dans le CLI, dans les fichiers de configuration, dans les
 * profils, et dans les trois fenêtres du Desktop. Le cœur les tenait
 * (`core/levels.ts`, `core/types.ts`), mais le renderer Desktop ne peut pas
 * importer le cœur (DESKTOP.md §4.2) : le contrat IPC en gardait donc une
 * seconde copie, et un test de dérive comparait les deux listes. Une copie
 * surveillée reste une copie — le test disait quand elles divergeaient, jamais
 * comment les tenir ensemble.
 *
 * Ce module est l'autorité. Il ne dépend de rien : pas de Zod, pas de Node,
 * aucune application. Le cœur en dérive ses schémas, le contrat IPC le
 * réexporte pour le renderer, et il n'existe plus qu'une liste à modifier
 * quand un niveau s'ajoute.
 */

/** Ordre significatif : le cycle ⇥ de la capsule le parcourt dans ce sens. */
export const REPROMPT_LEVEL_IDS = ["minimal", "standard", "complete"] as const;
export type RepromptLevelId = (typeof REPROMPT_LEVEL_IDS)[number];
export const DEFAULT_REPROMPT_LEVEL_ID = "standard" satisfies RepromptLevelId;

/** Du plus permissif au plus strict ; l'ordre est celui des réglages. */
export const FIDELITY_MODE_IDS = ["permissive", "balanced", "strict"] as const;
export type FidelityModeId = (typeof FIDELITY_MODE_IDS)[number];
export const DEFAULT_FIDELITY_MODE_ID = "balanced" satisfies FidelityModeId;
