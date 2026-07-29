import React from "react";
import { Text } from "ink";
import { theme } from "../theme/tokens.js";

const frames = [".", "o", "O", "o"];

export function Spinner(): React.JSX.Element {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setFrame((value) => (value + 1) % frames.length);
    }, theme.behavior.spinnerFrameIntervalMs);
    return () => {
      clearInterval(id);
    };
  }, []);

  return <Text color={theme.color.accent}>{frames[frame]} Génération en cours...</Text>;
}
