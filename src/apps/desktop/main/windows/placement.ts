/**
 * Capsule placement (DESKTOP.md §3 and §4.3).
 *
 * Anchor: the cursor position — the selection bounds would require the
 * Objective-C Accessibility API, which is not portable, and the cursor is
 * where the attention is. Two anchors only: near the cursor when there is a
 * selection, centred otherwise. One component, one state machine.
 *
 * Pure module: screen geometry goes in, window coordinates come out. Tested
 * without Electron.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Electron's `Display.workArea`: the screen minus menu bar and Dock. */
export interface WorkArea extends Point, Size {}

/** Margin kept between the capsule and the work-area edges. */
export const EDGE_MARGIN = 12;
/** Vertical gap below the cursor, so the capsule does not cover the caret. */
const CURSOR_GAP = 8;

export type CapsuleAnchor = { kind: "cursor"; point: Point } | { kind: "centered" };

/**
 * De quel côté de l'ancre la capsule s'ouvre, décidé une fois pour la session.
 *
 * `below` fixe le BORD HAUT sur le curseur, `above` fixe le BORD BAS ;
 * `centered` garde la boîte au centre de la zone de travail. Le côté est
 * choisi une seule fois, à l'ouverture, avec la hauteur MAXIMALE que la
 * session pourra prendre : ainsi une capsule qui grandit s'étend du côté qui a
 * la place, au lieu de basculer d'un côté à l'autre au milieu d'un trajet.
 */
export type CapsuleSide = "below" | "above" | "centered";

/**
 * Le côté à tenir pour toute la session.
 *
 * `maxHeight` est la plus grande hauteur que la capsule pourra atteindre, pas
 * celle qu'elle a maintenant : décider avec la hauteur courante ferait
 * basculer la fenêtre au-dessus du curseur dès que le résultat s'allonge, ce
 * qui est exactement le saut que l'on cherche à supprimer.
 */
export function resolveCapsuleSide(
  anchor: CapsuleAnchor,
  maxHeight: number,
  workArea: WorkArea,
): CapsuleSide {
  if (anchor.kind === "centered") return "centered";
  const fitsBelow = anchor.point.y + CURSOR_GAP + maxHeight <= bottomLimit(workArea);
  if (fitsBelow) return "below";
  const fitsAbove = anchor.point.y - CURSOR_GAP - maxHeight >= workArea.y + EDGE_MARGIN;
  if (fitsAbove) return "above";
  // Ni l'un ni l'autre — écran bas, ou capsule plus haute que la zone de
  // travail. On garde le côté le plus large ; le calage fera le reste.
  return anchor.point.y - workArea.y >= workArea.y + workArea.height - anchor.point.y
    ? "above"
    : "below";
}

/**
 * Où va le coin haut-gauche de la capsule, pour un côté déjà choisi.
 *
 * Fonction pure de (ancre, côté, taille, zone de travail) : deux appels avec
 * les mêmes entrées rendent le même point. C'est ce qui empêche la fenêtre de
 * dériver à chaque redimensionnement — la position ne se calcule jamais à
 * partir de la position précédente, donc rien ne s'accumule.
 */
export function placeCapsuleOnSide(
  anchor: CapsuleAnchor,
  side: CapsuleSide,
  capsule: Size,
  workArea: WorkArea,
): Point {
  const centerX = anchor.kind === "cursor" ? anchor.point.x : workArea.x + workArea.width / 2;
  const x = clamp(
    Math.round(centerX - capsule.width / 2),
    workArea.x + EDGE_MARGIN,
    workArea.x + workArea.width - capsule.width - EDGE_MARGIN,
  );

  const minY = workArea.y + EDGE_MARGIN;
  const maxY = workArea.y + workArea.height - capsule.height - EDGE_MARGIN;
  return { x, y: clamp(verticalOrigin(anchor, side, capsule.height, workArea), minY, maxY) };
}

function verticalOrigin(
  anchor: CapsuleAnchor,
  side: CapsuleSide,
  height: number,
  workArea: WorkArea,
): number {
  if (anchor.kind === "centered" || side === "centered") {
    return Math.round(workArea.y + workArea.height / 2 - height / 2);
  }
  // `below` fixe le haut, `above` fixe le bas : dans les deux cas une seule
  // arête reste immobile pendant que la capsule grandit.
  return side === "below" ? anchor.point.y + CURSOR_GAP : anchor.point.y - CURSOR_GAP - height;
}

function bottomLimit(workArea: WorkArea): number {
  return workArea.y + workArea.height - EDGE_MARGIN;
}

/**
 * Where the capsule's top-left corner goes.
 *
 * Horizontally the capsule is centred on the anchor, clamped inside the work
 * area. Vertically it opens BELOW the cursor (the eye reads downwards); when
 * there is not enough room below, it flips above; failing both, it is clamped
 * inside the work area.
 */
export function placeCapsule(anchor: CapsuleAnchor, capsule: Size, workArea: WorkArea): Point {
  return placeCapsuleOnSide(
    anchor,
    resolveCapsuleSide(anchor, capsule.height, workArea),
    capsule,
    workArea,
  );
}

/** Under the tray icon, horizontally centred on it, clamped to the screen. */
export function placePopover(
  trayBounds: { x: number; y: number; width: number; height: number },
  popover: Size,
  workArea: WorkArea,
): Point {
  return placeCapsule(
    {
      kind: "cursor",
      point: { x: trayBounds.x + trayBounds.width / 2, y: trayBounds.y + trayBounds.height },
    },
    popover,
    workArea,
  );
}

function clamp(value: number, min: number, max: number): number {
  // A capsule larger than the work area makes min > max: pin to the origin.
  if (min > max) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
