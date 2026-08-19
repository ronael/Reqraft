/* @jsxImportSource @opentui/react */
import { useEffect, useState } from "react";
import type React from "react";
import { theme } from "@/apps/cli/tui/theme/index.js";

export interface SpinnerProps {
  label: string;
  /** Stops the timer when the run ends, so no interval outlives the state. */
  active?: boolean;
}

/**
 * Waiting indicator.
 *
 * The mockup drew this as a sweeping gradient bar. A terminal has no gradient,
 * so the intent — "something is happening, on one line, without noise" — is
 * carried by a braille cycle in a single cell. Braille is the one glyph family
 * that animates without changing width, so the label never shifts.
 *
 * Nothing else in the interface animates: a spinner earns its motion because
 * the alternative is a screen that looks frozen while the model thinks.
 */
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function Spinner({ label, active = true }: Readonly<SpinnerProps>): React.ReactNode {
  const { color } = theme.tokens;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const interval = setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length);
    }, theme.tokens.motion.spinnerIntervalMs);
    return () => {
      clearInterval(interval);
    };
  }, [active]);

  return (
    <text>
      <span fg={color.accent}>{active ? FRAMES[frame] : FRAMES[0]}</span>
      <span fg={color.textMuted}>{` ${label}`}</span>
    </text>
  );
}
