/**
 * Quand le raccourci de remplacement direct applique un résultat tout seul.
 *
 * Ce raccourci saute le seul moment où l'on relit le résultat avant qu'il
 * n'atterrisse dans le document. Il ne le fait donc que quand rien n'appelle
 * cette relecture : un résultat complet — jamais le texte partiel laissé par
 * une interruption —, jugé bon par les contrôles de fidélité, et que personne
 * n'a touché depuis l'ouverture. Dans tous les autres cas la capsule reste sur
 * le résultat, où ⏎ fonctionne comme d'habitude.
 *
 * Module pur, comme `keyboard.ts` : la suite le vérifie sous Node, sans DOM.
 */
import type { RepromptResult } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * `apply` : remplacer maintenant. `review` : ne pas remplacer, et dire
 * pourquoi. `wait` : rien à décider encore, ou plus rien à décider.
 */
export type AutoApplyDecision = "apply" | "review" | "wait";

export interface AutoApplySession {
  /**
   * Ouverte par le raccourci de remplacement direct, et personne n'est
   * intervenu depuis. Retombe à faux dès la première décision.
   */
  armed: boolean;
  /** Le résultat du run, absent pendant la génération et après une interruption. */
  result: RepromptResult | null;
}

export function autoApplyDecision(session: AutoApplySession): AutoApplyDecision {
  if (!session.armed || session.result === null) return "wait";
  return session.result.quality.status === "good" ? "apply" : "review";
}

/** Les touches qui, seules, ne disent rien de ce que la personne veut faire. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Alt",
  "AltGraph",
  "CapsLock",
  "Control",
  "Fn",
  "Meta",
  "OS",
  "Shift",
]);

/**
 * Une frappe veut-elle dire que la personne reprend la main ?
 *
 * Les touches du raccourci peuvent encore être enfoncées quand la capsule
 * prend le focus, et leur répétition automatique arrive ici : ni une
 * répétition ni un modificateur seul ne sont une décision. Toute autre touche
 * en est une — changer de niveau, relancer, éditer, fermer —, et le résultat
 * attendra alors ⏎ comme dans une capsule ordinaire.
 */
export function isUserIntervention(event: Readonly<{ key: string; repeat: boolean }>): boolean {
  return !event.repeat && !MODIFIER_KEYS.has(event.key);
}
