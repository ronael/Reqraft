import type { CliRenderer, Renderable } from "@opentui/core";

/**
 * Focus capture/restore for modals.
 *
 * OpenTUI owns the focus state (`renderer.currentFocusedRenderable`); these
 * helpers only remember what was focused before a modal opened and put it
 * back on close, checking the element is still mounted.
 */

export function captureFocus(renderer: CliRenderer): Renderable | null {
  const focused = renderer.currentFocusedRenderable;
  if (!focused || focused.isDestroyed) return null;
  return focused;
}

export function isMounted(renderer: CliRenderer, target: Renderable | null): boolean {
  if (!target || target.isDestroyed) return false;
  let node: Renderable | null = target;
  while (node) {
    if (node === renderer.root) return true;
    node = node.parent;
  }
  return false;
}

/** Focuses `target` if it is still in the tree. Returns whether focus moved. */
export function restoreFocus(renderer: CliRenderer, target: Renderable | null): boolean {
  if (!target || !isMounted(renderer, target)) return false;
  target.focus();
  return true;
}
