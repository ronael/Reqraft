import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";

export function ShortcutBar({
  compact,
  hasResult,
}: Readonly<{
  compact: boolean;
  hasResult: boolean;
}>): React.JSX.Element {
  const items = compact
    ? [
        ["Entrée", "Générer"],
        ["^K", "Actions"],
        ["?", "Aide"],
        ["Esc", "Quitter"],
      ]
    : [
        ["Entrée", "Générer"],
        ["^K", "Actions"],
        ["^P", "Profil"],
        ["^L", "Niveau"],
        ["^M", "Modèle"],
        ["^D", "Diff"],
        ["^Y", "Copier"],
        ["?", "Aide"],
        ["Esc", "Quitter"],
      ];

  return (
    <Box flexWrap="wrap">
      {items.map(([key, label]) => {
        const disabled = !hasResult && (key === "^D" || key === "^Y");
        return (
          <Box key={key} marginRight={1}>
            <Text color={disabled ? theme.color.muted : theme.color.accent}>{key}</Text>
            <Text dimColor> {label}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
