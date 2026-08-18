/**
 * Focus model.
 *
 * Focus is a value, not a scattered `useState("editor")`. Modelling it here
 * keeps the ring predictable and lets every rule be tested without rendering:
 * where Tab goes, what an overlay suspends, and what comes back when it closes.
 */

export type FocusZone = "editor" | "result" | "toolbar";

/** Tab order. The editor leads because it is where a session starts. */
export const FOCUS_RING: readonly FocusZone[] = ["editor", "result", "toolbar"];

export interface FocusState {
  zone: FocusZone;
  /**
   * Zone to restore when an overlay closes. Null while no overlay is open —
   * an overlay is the only thing that suspends focus rather than moving it.
   */
  suspended: FocusZone | null;
}

export interface FocusOptions {
  /** A result panel that does not exist yet must not be focusable. */
  hasResult: boolean;
}

export const INITIAL_FOCUS: FocusState = { zone: "editor", suspended: null };

function selectableZones(options: FocusOptions): FocusZone[] {
  return FOCUS_RING.filter((zone) => zone !== "result" || options.hasResult);
}

function step(state: FocusState, options: FocusOptions, delta: 1 | -1): FocusState {
  // An overlay owns the keyboard: Tab must not move focus underneath it.
  if (state.suspended !== null) return state;

  const zones = selectableZones(options);
  if (zones.length === 0) return state;

  // A zone that just became unselectable (a result panel that went away)
  // leaves `indexOf` at -1; falling back to the first zone keeps Tab working
  // instead of stranding focus.
  const current = zones.indexOf(state.zone);
  const index = current === -1 ? 0 : (current + delta + zones.length) % zones.length;
  const next = zones[index];
  return next === undefined ? state : { ...state, zone: next };
}

export function focusNext(state: FocusState, options: FocusOptions): FocusState {
  return step(state, options, 1);
}

export function focusPrevious(state: FocusState, options: FocusOptions): FocusState {
  return step(state, options, -1);
}

export function focus(state: FocusState, zone: FocusZone, options: FocusOptions): FocusState {
  if (!selectableZones(options).includes(zone)) return state;
  return { ...state, zone };
}

/**
 * Opens an overlay: remembers where focus was so closing can put it back.
 * Re-entrant by design — opening a second overlay keeps the original anchor
 * rather than pointing back at the first overlay.
 */
export function suspendFocus(state: FocusState): FocusState {
  if (state.suspended !== null) return state;
  return { ...state, suspended: state.zone };
}

/** Closes an overlay and restores the zone focus came from. */
export function restoreFocus(state: FocusState): FocusState {
  if (state.suspended === null) return state;
  return { zone: state.suspended, suspended: null };
}

/** True while an overlay holds the keyboard. */
export function isSuspended(state: FocusState): boolean {
  return state.suspended !== null;
}

/**
 * Whether a zone should render as focused.
 *
 * An open overlay suspends every zone: leaving the editor visually focused
 * would also leave it consuming keys the overlay is supposed to own — Escape
 * in particular never reaches the router if a focused textarea eats it first.
 */
export function isZoneFocused(state: FocusState, zone: FocusZone): boolean {
  return state.suspended === null && state.zone === zone;
}
