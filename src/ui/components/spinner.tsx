import React from "react";
import { Text } from "ink";
import process from "node:process";
import { detectUnicode } from "../theme/capabilities.js";
import { getSpinnerFrames } from "../theme/symbols.js";
import { theme } from "../theme/tokens.js";

const FRAMES = getSpinnerFrames(detectUnicode(process.env, process.platform));

/**
 * Owns its ticking state, so a turning spinner never re-renders the screen
 * around it (the TUI implementation brief sections 22).
 */
export function Spinner({ label }: Readonly<{ label?: string }>): React.JSX.Element {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setFrame((value) => (value + 1) % FRAMES.length);
    }, theme.behavior.spinnerFrameIntervalMs);
    return () => {
      clearInterval(id);
    };
  }, []);

  return (
    <Text color={theme.color.accent}>
      {FRAMES[frame]} {label ?? "Génération en cours"}
    </Text>
  );
}
