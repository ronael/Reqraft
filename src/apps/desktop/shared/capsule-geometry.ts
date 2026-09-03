import type { CapsuleState } from "./capsule-machine.js";

/**
 * La hauteur de la capsule, décidée par l'état plutôt que par le contenu qui
 * bouge.
 *
 * Le POC suivait le contenu avec un `ResizeObserver` borné 148–440 px. Un
 * observateur voit chaque fragment de streaming et chaque frappe : la fenêtre
 * oscillait d'une ligne pendant la saisie, et DESKTOP.md §4.3 a tranché en
 * réservant une hauteur fixe pour éviter exactement cela. Le compromis retenu
 * ici garde la promesse de §4.3 et rend l'adaptation possible en déplaçant la
 * décision : la hauteur n'est recalculée qu'aux instants où la capsule change
 * d'état, jamais pendant qu'un texte arrive ou qu'on l'édite.
 *
 * Trois régimes, et un seul actif à la fois :
 *
 * - `reserved` — la hauteur de travail (§4.3), posée une fois à l'ouverture et
 *   tenue pendant toute la génération. Aucune mesure, donc aucun saut pendant
 *   que le texte arrive.
 * - `adaptive` — la capsule est posée sur un contenu qui ne bouge plus : elle
 *   prend sa hauteur naturelle, bornée. C'est ce qui supprime le grand vide
 *   sous un résultat court.
 * - `hold` — on ne touche à rien. La frappe en fait partie, et c'est le point
 *   central : tant que le curseur est dans un champ, la géométrie est gelée et
 *   le corps défile. `applying` aussi — le texte est déjà parti, redimensionner
 *   à cet instant ferait sauter la fenêtre au moment précis où l'utilisateur
 *   attend un collage.
 *
 * Module pur, partagé par le renderer et le processus principal : le renderer
 * propose une hauteur, le principal la borne à nouveau — il est le seul à
 * connaître la zone de travail, et il ne fait jamais confiance au renderer.
 */

export const CAPSULE_WIDTH = 560;

/**
 * La hauteur réservée pendant qu'un run tourne (§4.3).
 *
 * Inchangée : c'est la valeur que la capsule a toujours eue, et la garder
 * signifie qu'aucun trajet existant ne change de dimensions.
 */
export const CAPSULE_RESERVED_HEIGHT = 380;

/**
 * Le plancher : bandeau (34) + pied (64) + une ligne de corps et ses retraits.
 *
 * Mesuré dans le vrai renderer à 560 px de large, pas estimé. En dessous, le
 * pied et le bandeau se toucheraient.
 */
export const CAPSULE_MIN_HEIGHT = 148;

/** Le plafond : au-delà, la capsule cesse d'être une capsule. */
export const CAPSULE_MAX_HEIGHT = 440;

/**
 * La hauteur d'ouverture d'une capsule de saisie libre.
 *
 * Le champ de saisie a une hauteur fixe : bandeau (34) + champ (132) + le
 * bandeau de commandes (33), plus les retraits. La valeur est donc connue
 * d'avance, et l'ouvrir directement à cette taille évite le seul saut que
 * l'adaptation ne pourrait pas absorber — celui qui a lieu entre l'apparition
 * de la fenêtre et le premier rendu du renderer. Elle est vérifiée contre le
 * rendu réel par le scénario `capsule-ui` : si la feuille de style change, le
 * test échoue au lieu de laisser la capsule clignoter.
 */
export const CAPSULE_INPUT_HEIGHT = 204;

/**
 * Le pas de quantification.
 *
 * Les hauteurs mesurées sont fractionnaires (sous-pixels de police). Arrondir
 * au pas supérieur évite qu'un demi-pixel fasse apparaître une barre de
 * défilement pour une ligne qui tenait.
 */
export const CAPSULE_HEIGHT_STEP = 4;

/** Ce que la capsule fait de sa hauteur à un instant donné. */
export type CapsuleHeightPolicy = "reserved" | "adaptive" | "hold";

/** L'état visible, et ce qui le recouvre sans le changer. */
export interface CapsulePhase {
  readonly state: CapsuleState;
  /** La feuille de profils est ouverte par-dessus le corps. */
  readonly picking: boolean;
  /**
   * Le curseur est dans un champ : le prompt ou le résultat.
   *
   * Le seul régime qui compte vraiment pour la stabilité. Le contenu change à
   * chaque touche, et une hauteur qui suivrait ferait osciller la fenêtre ligne
   * par ligne — le défaut exact du POC. Le corps défile à la place, et la
   * capsule se réajuste une seule fois, quand le champ rend la main.
   */
  readonly editing: boolean;
}

/** Les états qui attendent quelque chose : la hauteur y est réservée. */
const RESERVED_STATES: ReadonlySet<CapsuleState> = new Set<CapsuleState>([
  "capture",
  "analysis",
  "generating",
  "streaming",
]);

/** Les états posés : le contenu ne bougera plus tant qu'ils durent. */
const ADAPTIVE_STATES: ReadonlySet<CapsuleState> = new Set<CapsuleState>([
  "input",
  "ready",
  "comparison",
  "error",
]);

export function capsuleHeightPolicy(phase: CapsulePhase): CapsuleHeightPolicy {
  // Pendant la frappe, rien ne bouge. En premier, avant tout le reste.
  if (phase.editing) return "hold";
  // La feuille de profils est une liste qui défile : elle veut une boîte
  // stable et généreuse, pas la hauteur du résultat qu'elle recouvre.
  if (phase.picking) return "reserved";
  if (RESERVED_STATES.has(phase.state)) return "reserved";
  if (ADAPTIVE_STATES.has(phase.state)) return "adaptive";
  return "hold";
}

/**
 * La hauteur retenue pour une hauteur naturelle mesurée.
 *
 * `available` est la place réellement offerte par l'écran : sur un portable
 * 13" avec un Dock, la zone de travail peut être plus basse que le plafond.
 * Le processus principal repasse toujours par ici avec sa propre valeur — une
 * hauteur venue du renderer est une suggestion, jamais une consigne.
 */
export function capsuleHeightFor(natural: number, available = CAPSULE_MAX_HEIGHT): number {
  const ceiling = Math.min(CAPSULE_MAX_HEIGHT, Math.max(CAPSULE_MIN_HEIGHT, Math.floor(available)));
  if (!Number.isFinite(natural)) return Math.min(ceiling, CAPSULE_RESERVED_HEIGHT);
  const stepped = Math.ceil(Math.max(0, natural) / CAPSULE_HEIGHT_STEP) * CAPSULE_HEIGHT_STEP;
  return Math.min(ceiling, Math.max(CAPSULE_MIN_HEIGHT, stepped));
}
