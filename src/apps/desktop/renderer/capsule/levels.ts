import { REPROMPT_LEVEL_IDS, type RepromptResult } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Les règles de niveau de la capsule.
 *
 * Module pur, comme `keyboard.ts` et `auto-apply.ts` : pas de DOM, pas de
 * React. La règle se vérifie en l'appelant, sans monter la capsule.
 */

export type Level = (typeof REPROMPT_LEVEL_IDS)[number];

/** ⇥ monte d'un niveau, ⇧⇥ redescend, et le cycle tourne dans les deux sens. */
export function cycleRepromptLevel(current: Level, direction: 1 | -1): Level {
  const currentIndex = REPROMPT_LEVEL_IDS.indexOf(current);
  const safeIndex = currentIndex === -1 ? REPROMPT_LEVEL_IDS.indexOf("standard") : currentIndex;
  const nextIndex = (safeIndex + direction + REPROMPT_LEVEL_IDS.length) % REPROMPT_LEVEL_IDS.length;
  return REPROMPT_LEVEL_IDS[nextIndex] ?? "standard";
}

/**
 * « baisser le niveau » est-il à offrir ?
 *
 * Devant un résultat trop long, et seulement s'il existe un niveau plus bas :
 * sous « minimal » il n'y a rien, et le cycle, lui, repartirait en
 * « complete ».
 */
export function offersLowerLevel(result: RepromptResult | null, level: Level): boolean {
  const tooLong =
    result?.quality.signals.some((signal) => signal.code === "disproportionate_expansion") === true;
  return tooLong && level !== "minimal";
}
