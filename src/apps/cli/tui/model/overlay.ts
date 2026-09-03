/**
 * Overlay interaction model.
 *
 * An overlay is any modal surface that owns the keyboard while it is open:
 * the four pickers, the command palette and help. Focus is suspended by the
 * focus model; this module holds the *list* part of that interaction — which
 * row is highlighted and, for the palette, what the query is.
 *
 * Pure data and pure predicates, like every other model file, so the arrow
 * keys and filtering can be tested without rendering anything.
 */

export type OverlayId =
  | "profile"
  | "level"
  | "provider"
  | "model"
  | "palette"
  | "help"
  /** Actions available on the profile highlighted in the picker. */
  | "profile-actions"
  /** Create / edit / duplicate form for a local profile. */
  | "profile-form";

export interface OverlayState {
  active: OverlayId | null;
  /** Highlighted row in the current list (picker or filtered palette). */
  index: number;
  /** Palette filter. Picker and help ignore it. */
  query: string;
}

export const INITIAL_OVERLAY: OverlayState = { active: null, index: 0, query: "" };

/** `help` and `palette` render their own content rather than a flat list. */
export function isListOverlay(overlay: OverlayId | null): boolean {
  return (
    overlay === "profile" || overlay === "level" || overlay === "provider" || overlay === "model"
  );
}

/**
 * Ouvre un panneau sur une liste neuve.
 *
 * Sans état à reprendre : la recherche repart vide à chaque ouverture, parce
 * que les sélecteurs se filtrent désormais eux aussi et qu'hériter de la frappe
 * précédente ouvrirait la liste déjà réduite sans que rien ne l'explique.
 */
export function openOverlay(overlay: OverlayId): OverlayState {
  return { active: overlay, index: 0, query: "" };
}

export function closeOverlay(state: OverlayState): OverlayState {
  return { ...state, active: null };
}

export function moveSelection(state: OverlayState, delta: 1 | -1, count: number): OverlayState {
  if (count <= 0) return state;
  return { ...state, index: (state.index + delta + count) % count };
}

/** Clamp after the list shrinks (e.g. a palette query narrows the results). */
export function clampSelection(state: OverlayState, count: number): OverlayState {
  if (count <= 0) return { ...state, index: 0 };
  return { ...state, index: Math.min(state.index, count - 1) };
}

export function setQuery(state: OverlayState, query: string): OverlayState {
  return { ...state, query, index: 0 };
}

export interface VisibleWindow {
  start: number;
  end: number;
}

/**
 * La tranche de lignes à afficher pour que la ligne surlignée reste visible.
 *
 * Le dialogue plafonne déjà sa hauteur et défile au-delà, mais le défilement
 * appartient au moteur de rendu : rien ne le fait suivre le curseur. Avec un
 * catalogue de plusieurs dizaines de profils, les flèches emmenaient donc le
 * surlignage hors de l'écran, et la liste devenait illisible bien avant d'être
 * pleine.
 *
 * La fenêtre ne bouge que lorsqu'il le faut : tant que la ligne visée est déjà
 * dedans, elle ne glisse pas — une liste qui se recentre à chaque flèche est
 * illisible pour d'autres raisons.
 */
export function visibleWindow(
  index: number,
  count: number,
  capacity: number,
  previousStart = 0,
): VisibleWindow {
  if (count <= 0 || capacity <= 0) return { start: 0, end: 0 };
  if (count <= capacity) return { start: 0, end: count };

  const cursor = Math.min(Math.max(index, 0), count - 1);
  const maximumStart = count - capacity;
  let start = Math.min(Math.max(previousStart, 0), maximumStart);

  if (cursor < start) start = cursor;
  if (cursor >= start + capacity) start = cursor - capacity + 1;

  return { start, end: start + capacity };
}

/** True while any overlay holds the keyboard. */
export function hasOverlay(state: OverlayState): boolean {
  return state.active !== null;
}

export function isActive(state: OverlayState, overlay: OverlayId): boolean {
  return state.active === overlay;
}
