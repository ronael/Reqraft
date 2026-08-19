/* @jsxImportSource @opentui/react */
import React from "react";
import { BorderChars } from "@opentui/core";
import { theme } from "@/apps/cli/tui/theme/index.js";

export interface RailProps {
  /** Accent by default; a failed turn passes the error token instead. */
  color?: string;
  children?: React.ReactNode;
}

/**
 * Vertical rail marking one turn of the conversation.
 *
 * This was a `▍ ` glyph printed at the head of the label line. A glyph can only
 * mark the row it sits on, so the rail stopped at the label and the body below
 * floated unattached — the mark named the turn instead of enclosing it. A real
 * left border runs the full height of the box, so the rail now spans the label
 * *and* its body and the turn reads as one block.
 *
 * `border` takes a side list, so a box can carry one edge without the other
 * three. The style follows `border.default` rather than being chosen here:
 * a rail is the same drawing vocabulary as every other frame, and on a
 * colourless terminal it is the only thing still separating the turns.
 */
export function Rail({ color, children }: Readonly<RailProps>): React.ReactNode {
  const { tokens } = theme;

  return (
    <box
      style={{
        border: ["left"],
        borderStyle: tokens.border.default,
        borderColor: color ?? tokens.color.accent,
        // A border is one cell wide whatever the style, so weight is the only
        // way to make the rail heavier. Only `vertical` is ever painted here;
        // the rest of the set comes from the current style so a box that did
        // draw its other sides would still look like every other frame.
        customBorderChars: { ...BorderChars[tokens.border.default], vertical: tokens.border.rail },
        // The glyph carried its own trailing space; the border does not.
        paddingLeft: tokens.spacing.xs,
        flexDirection: "column",
        flexGrow: 0,
      }}
    >
      {children}
    </box>
  );
}
