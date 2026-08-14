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
const EDGE_MARGIN = 12;
/** Vertical gap below the cursor, so the capsule does not cover the caret. */
const CURSOR_GAP = 8;

export type CapsuleAnchor = { kind: "cursor"; point: Point } | { kind: "centered" };

/**
 * Where the capsule's top-left corner goes.
 *
 * Horizontally the capsule is centred on the anchor, clamped inside the work
 * area. Vertically it opens BELOW the cursor (the eye reads downwards); when
 * there is not enough room below, it flips above; failing both, it is clamped
 * inside the work area.
 */
export function placeCapsule(anchor: CapsuleAnchor, capsule: Size, workArea: WorkArea): Point {
  const centerX = anchor.kind === "cursor" ? anchor.point.x : workArea.x + workArea.width / 2;
  const x = clamp(
    Math.round(centerX - capsule.width / 2),
    workArea.x + EDGE_MARGIN,
    workArea.x + workArea.width - capsule.width - EDGE_MARGIN,
  );

  const maxY = workArea.y + workArea.height - capsule.height - EDGE_MARGIN;
  const minY = workArea.y + EDGE_MARGIN;
  let y: number;
  if (anchor.kind === "centered") {
    y = Math.round(workArea.y + workArea.height / 2 - capsule.height / 2);
  } else {
    const below = anchor.point.y + CURSOR_GAP;
    const above = anchor.point.y - CURSOR_GAP - capsule.height;
    if (below <= maxY) {
      y = below;
    } else if (above >= minY) {
      y = above;
    } else {
      y = maxY;
    }
  }

  return { x, y: clamp(y, minY, maxY) };
}

function clamp(value: number, min: number, max: number): number {
  // A capsule larger than the work area makes min > max: pin to the origin.
  if (min > max) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
