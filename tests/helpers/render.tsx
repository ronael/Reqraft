import type React from "react";
import { render } from "ink-testing-library";

/**
 * Built from a char code rather than written as a literal: an escape character
 * inside a regular expression trips `no-control-regex`.
 */
const ANSI_STYLES = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Rendered frame with styling stripped, so assertions read plainly. */
export function frameOf(element: React.ReactElement): string {
  const { lastFrame } = render(element);
  return (lastFrame() ?? "").replaceAll(ANSI_STYLES, "");
}

/**
 * Width of the drawn box.
 *
 * AppFrame centres its content, so raw line length includes the padding the
 * test terminal adds around it; only the box itself is measured.
 */
export function widestLine(frame: string): number {
  return Math.max(...frame.split("\n").map((line) => line.trim().length));
}
