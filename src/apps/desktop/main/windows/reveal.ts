/**
 * What a second launch should bring to the front.
 *
 * Reqraft runs accessory-style: it has no Dock icon, and the capsule and the
 * popover spend their lives hidden rather than destroyed. So "an instance is
 * already running" is invisible — relaunching from Finder or Spotlight is a
 * reasonable way to ask "show me something", and answering with nothing at all
 * looks exactly like an application that failed to start.
 *
 * Electron-free on purpose, like the rest of `main/`: the windows arrive as a
 * minimal shape so the decision is testable without a runtime.
 */

/** The slice of `BrowserWindow` this decision needs. */
export interface RevealableWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

export type RevealOutcome = "focused" | "opened";

/**
 * Brings an already-open window forward, or opens the fallback surface.
 *
 * `windows` is read in priority order and the first usable one wins — a window
 * the user can currently see is what they are most likely asking for, and
 * opening the settings on top of it would bury it.
 */
/**
 * Whether a window is one the user could be asking to see.
 *
 * A hidden window is not: the capsule is hidden between triggers, and showing
 * it would put an empty capture surface on screen for no reason. Minimised is
 * different — the user opened it and did not close it.
 */
function isRevealable(window: RevealableWindow): boolean {
  if (window.isDestroyed()) return false;
  return window.isVisible() || window.isMinimized();
}

export function revealExistingWindow(
  windows: readonly (RevealableWindow | null | undefined)[],
  openFallback: () => void,
): RevealOutcome {
  const candidate = windows.find((window) => window != null && isRevealable(window));

  if (candidate) {
    // Restore first: focusing a minimised window leaves it minimised, and the
    // user sees the Dock bounce rather than the window.
    if (candidate.isMinimized()) candidate.restore();
    candidate.show();
    candidate.focus();
    return "focused";
  }

  openFallback();
  return "opened";
}
