/* @jsxImportSource @opentui/react */
import { theme } from "@/apps/cli/tui/theme/index.js";
import React from "react";

export interface KeyCapProps {
  /** The chord itself, already formatted by the registry, e.g. `^K`. */
  label: string;
  /** Muted while the command is advertised but inert. */
  muted?: boolean;
}

/**
 * A key rendered as a cap: the chord on its own raised ground.
 *
 * The mockup draws a bordered pill around the chord. A box border costs a row
 * above and a row below, so a real frame cannot sit on a one-line shortcut —
 * at this resolution the cap is a filled ground with a space of padding, and
 * the fill's edge is what reads as the border.
 *
 * It returns a span rather than a box so it composes inside a `<text>` run:
 * the cap has to sit on the same line as the label beside it, and a box would
 * break the run onto its own line.
 */
export function KeyCap({ label, muted = false }: Readonly<KeyCapProps>): React.ReactNode {
  const { color } = theme.tokens;

  return (
    <span bg={color.surfaceRaised} fg={muted ? color.textMuted : color.accent}>
      {` ${label} `}
    </span>
  );
}
