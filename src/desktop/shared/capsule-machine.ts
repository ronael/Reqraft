/**
 * Capsule state machine (DESKTOP.md §8.2).
 *
 * Exactly one active state at a time. Every transition absent from §8.2's
 * table is a bug, not an improvisation — so the table IS the implementation:
 * `transition` returns null for anything the table does not allow, and the
 * tests walk every row.
 *
 * Pure module: no Electron, no DOM, no core imports — testable in isolation
 * and reusable by any renderer.
 */

export type CapsuleState =
  | "fermée"
  | "capture"
  | "saisie"
  | "analyse"
  | "génération"
  | "streaming"
  | "prêt"
  | "comparaison"
  | "application"
  | "erreur";

export type CapsuleEvent =
  /** Global shortcut fired. */
  | "raccourci"
  /** Selection captured with text. */
  | "capturé"
  /** Nothing to capture, or a non-textual clipboard. */
  | "rien-à-capturer"
  /** Free input validated. */
  | "validation"
  /** Local profile detection answered (instant, offline). */
  | "profil-détecté"
  /** First streamed fragment arrived. */
  | "premier-fragment"
  /** Full result received. */
  | "résultat-complet"
  /** User interrupted (⌘.). */
  | "interruption"
  /** Provider or engine error. */
  | "échec"
  /** ⌥ held: compare with the original. */
  | "comparer"
  /** ⌥ released. */
  | "fin-comparaison"
  /** ⏎: replace (or copy in floor mode). */
  | "accepter"
  /** Replacement applied — the capsule dissolves. */
  | "appliqué"
  /** ⌘R: run again. */
  | "relancer"
  /** esc. */
  | "fermer";

/** The §8.2 table, literally. Anything not listed here returns null. */
const TRANSITIONS: Readonly<Record<CapsuleState, Readonly<Partial<Record<CapsuleEvent, CapsuleState>>>>> = {
  fermée: { raccourci: "capture" },
  capture: {
    capturé: "analyse",
    "rien-à-capturer": "saisie",
  },
  saisie: { validation: "analyse" },
  analyse: { "profil-détecté": "génération" },
  génération: {
    "premier-fragment": "streaming",
    "résultat-complet": "prêt",
    interruption: "fermée",
    échec: "erreur",
  },
  streaming: {
    "résultat-complet": "prêt",
    interruption: "prêt",
    échec: "erreur",
  },
  prêt: {
    comparer: "comparaison",
    accepter: "application",
    relancer: "analyse",
    fermer: "fermée",
  },
  comparaison: { "fin-comparaison": "prêt" },
  application: { appliqué: "fermée" },
  erreur: { fermer: "fermée" },
};

/**
 * Interruption nuance from §8.2: from `génération` | `streaming`, an interrupt
 * lands on `prêt` when partial text exists, on `fermée` otherwise. The caller
 * knows whether partial text was received; this helper encodes the rule.
 */
export function interruptTarget(state: CapsuleState, hasPartialText: boolean): CapsuleState | null {
  if (state !== "génération" && state !== "streaming") {
    return null;
  }
  if (hasPartialText) {
    return "prêt";
  }
  return TRANSITIONS[state].interruption ?? null;
}

export function transition(state: CapsuleState, event: CapsuleEvent): CapsuleState | null {
  return TRANSITIONS[state][event] ?? null;
}

/** Every state the machine can be in — for exhaustiveness checks in tests. */
export const CAPSULE_STATES: readonly CapsuleState[] = [
  "fermée",
  "capture",
  "saisie",
  "analyse",
  "génération",
  "streaming",
  "prêt",
  "comparaison",
  "application",
  "erreur",
];
