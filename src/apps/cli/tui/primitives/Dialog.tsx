/* @jsxImportSource @opentui/react */
import React from "react";
import { Surface } from "./Surface.js";
import { ScrollArea } from "./ScrollArea.js";
import { theme } from "@/apps/cli/tui/theme/index.js";

export interface DialogProps {
  title: string;
  open: boolean;
  /** Viewport, so the dialog can centre itself and cap its own height. */
  terminalWidth: number;
  terminalHeight: number;
  /** Rows the content wants. Above the cap the body scrolls instead of spilling. */
  contentRows: number;
  children?: React.ReactNode;
}

/**
 * Modal surface — the one overlay primitive every picker, the palette and help
 * render through, so they cannot drift apart.
 *
 * It floats: `position: absolute` over the whole viewport with a `zIndex`, not
 * a box in the column. That distinction is the whole point. As an in-flow child
 * it grew the fixed-height root beyond the terminal, which pushed the status
 * bar into the transcript's rows — the two then painted into the same cells and
 * produced the run-together footer. Overflow in a terminal does not clip, it
 * overwrites.
 *
 * Height is capped to the viewport and the body scrolls past that cap, so a
 * long list on a short terminal stays inside the frame instead of running off
 * the bottom. The cap is the viewport minus a margin rather than a fraction of
 * it: a ratio threw away rows on a tall terminal and made lists scroll that
 * would have fitted whole.
 *
 * Keyboard capture is not here: `routeKey` refuses to let keys through while an
 * overlay is open, and the focus model suspends the zone underneath. Keeping
 * both out means they stay testable without rendering a dialog at all.
 */
export function Dialog({
  title,
  open,
  terminalWidth,
  terminalHeight,
  contentRows,
  children,
}: Readonly<DialogProps>): React.ReactNode {
  if (!open) return null;

  const { dialog } = theme.components;

  const width = Math.min(
    dialog.maximumWidth,
    Math.max(dialog.minimumWidth, Math.floor(terminalWidth * dialog.widthRatio)),
    // Never wider than the terminal, whatever the tokens say.
    Math.max(dialog.minimumWidth, terminalWidth - 4),
  );

  // Border top and bottom, the title row, and one padding row each side, plus
  // a row of breathing space above and below the dialog.
  const chrome = 6;
  const available = Math.max(1, terminalHeight - chrome);
  const bodyRows = Math.max(1, Math.min(contentRows, available));
  const scrolls = contentRows > available;

  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Above the transcript and the editor, below the toast: a toast that
        // confirms an action taken *in* the dialog has to stay readable.
        zIndex: 20,
        // No backdrop fill. A terminal cannot dim or blur, and painting the
        // whole viewport opaque would hide the transcript the dialog is about.
        // The dialog's own surface is opaque, so it covers what it overlaps and
        // the rest of the screen stays readable behind it.
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <box style={{ width, flexDirection: "column" }}>
        <Surface title={title} tone="accent" focused>
          {scrolls ? (
            // The scrollbar draws in the last column of its viewport, so the
            // body gives it one back: without this the thumb landed on top of
            // the shortcut column and rendered "^G" as "^G█".
            <box style={{ paddingRight: 1, flexDirection: "column" }}>
              <ScrollArea height={bodyRows} showScrollbar>
                {children}
              </ScrollArea>
            </box>
          ) : (
            children
          )}
        </Surface>
      </box>
    </box>
  );
}
