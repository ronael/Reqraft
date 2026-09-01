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
  | "closed"
  | "capture"
  | "input"
  | "analysis"
  | "generating"
  | "streaming"
  | "ready"
  | "comparison"
  | "applying"
  | "error";

export type CapsuleEvent =
  /** Global shortcut fired. */
  | "shortcut"
  /** Selection captured with text. */
  | "captured"
  /** Nothing to capture, or a non-textual clipboard. */
  | "nothing-to-capture"
  /** Free input validated. */
  | "submitted"
  /**
   * The main process accepted the run and returned its `runId`. Named after
   * the §8.2 table row; it no longer implies a profile was resolved, since
   * `auto` is now decided by the model and only known with the result.
   */
  | "run-accepted"
  /** First streamed fragment arrived. */
  | "first-chunk"
  /** Full result received. */
  | "result-complete"
  /** User interrupted (⌘.). */
  | "interrupted"
  /** Provider or engine error. */
  | "failed"
  /** ⌥ held: compare with the original. */
  | "compare"
  /** ⌥ released. */
  | "compare-end"
  /** ⏎: replace (or copy in floor mode). */
  | "accept"
  /** Replacement applied — the capsule dissolves. */
  | "applied"
  /** ⌘R: run again. */
  | "rerun"
  /** esc. */
  | "close";

/** State constants reused across the table, helpers and the state list. */
const GENERATING: CapsuleState = "generating";
const STREAMING: CapsuleState = "streaming";

/** The §8.2 table, literally. Anything not listed here returns null. */
const TRANSITIONS: Readonly<
  Record<CapsuleState, Readonly<Partial<Record<CapsuleEvent, CapsuleState>>>>
> = {
  closed: { shortcut: "capture" },
  capture: {
    captured: "analysis",
    "nothing-to-capture": "input",
  },
  input: { submitted: "analysis" },
  // `failed` avant même le premier octet : `reprompt:start` peut refuser
  // l'invoke — configuration illisible, profil par défaut qui ne résout plus.
  // Sans cette sortie, le renderer posait bien l'erreur mais l'écran d'erreur
  // ne s'affiche que sur `error` : la capsule tournait dans le vide.
  analysis: { "run-accepted": GENERATING, failed: "error" },
  [GENERATING]: {
    "first-chunk": STREAMING,
    "result-complete": "ready",
    interrupted: "closed",
    failed: "error",
  },
  [STREAMING]: {
    "result-complete": "ready",
    interrupted: "ready",
    failed: "error",
  },
  ready: {
    compare: "comparison",
    accept: "applying",
    rerun: "analysis",
    close: "closed",
  },
  // `rerun` aussi : ⌘R, ⇥ et le choix d'un profil restent actifs pendant la
  // comparaison, et sans cette ligne ils repartaient sans jamais quitter
  // `comparison`.
  //
  // `accept` aussi, depuis que ⌘D épingle la comparaison : lire la comparaison
  // puis remplacer devient le trajet normal, et non plus un accident du
  // maintien de ⌥. Sans cette ligne, ⏎ partait bien vers le processus
  // principal mais la machine restait sur `comparison` — donc la sortie
  // d'échec `applying → ready` était injoignable, et un remplacement refusé
  // n'avait aucun état où retomber.
  comparison: { "compare-end": "ready", accept: "applying", rerun: "analysis" },
  // `failed` ramène au résultat, qui est toujours là.
  //
  // Sans cette sortie, `applying` était un cul-de-sac : un remplacement refusé
  // (permission macOS, application source qui ne revient pas) y laissait la
  // capsule pour de bon, et le pied ne rend ses touches que sur `ready` et
  // `comparison` — ⏎, ⌘C, ⌘R et ⇥ devenaient tous inertes. Vu de l'extérieur,
  // « le remplacement ne fait rien ».
  applying: { applied: "closed", failed: "ready" },
  error: { close: "closed" },
};

/**
 * Interruption nuance from §8.2: from `generating` | `streaming`, an interrupt
 * lands on `ready` when partial text exists, on `closed` otherwise. The caller
 * knows whether partial text was received; this helper encodes the rule.
 */
export function interruptTarget(state: CapsuleState, hasPartialText: boolean): CapsuleState | null {
  if (state !== GENERATING && state !== STREAMING) {
    return null;
  }
  return hasPartialText ? "ready" : "closed";
}

export function transition(state: CapsuleState, event: CapsuleEvent): CapsuleState | null {
  return TRANSITIONS[state][event] ?? null;
}

/** Every state the machine can be in — for exhaustiveness checks in tests. */
export const CAPSULE_STATES: readonly CapsuleState[] = [
  "closed",
  "capture",
  "input",
  "analysis",
  GENERATING,
  STREAMING,
  "ready",
  "comparison",
  "applying",
  "error",
];
