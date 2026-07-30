import React from "react";
import { Text } from "ink";
import { formatDuration } from "../formatters.js";

/** How often the elapsed counter refreshes. Fast enough to feel live. */
const TICK_MS = 200;

/**
 * Elapsed time while the provider is answering.
 *
 * Owns its own interval so the ticking clock re-renders this node alone rather
 * than the whole screen (DA.md section 22). Before this the panel only said
 * "en cours…", which told the user nothing during a sixteen-second wait.
 */
export function GenerationMeta({
  startedAt,
  receiving,
}: Readonly<{
  startedAt: number;
  /** True once the first fragment has arrived. */
  receiving: boolean;
}>): React.JSX.Element {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, []);

  const phase = receiving ? "réception" : "envoi";
  return (
    <Text dimColor>
      {phase} · {formatDuration(Math.max(0, now - startedAt))}
    </Text>
  );
}
