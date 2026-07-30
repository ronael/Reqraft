import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";
import type { PanelTone } from "../theme/types.js";

export function SectionCard({
  title,
  children,
  tone = "secondary",
}: Readonly<{
  title: string;
  children: React.ReactNode;
  tone?: PanelTone;
}>): React.JSX.Element {
  if (tone === "inline") {
    return (
      <Box flexDirection="column" paddingX={1} marginBottom={1}>
        <Text bold>{title}</Text>
        {children}
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle={tone === "primary" ? theme.border.primary : theme.border.secondary}
      borderColor={tone === "primary" ? theme.color.borderFocused : theme.color.border}
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color={tone === "primary" ? theme.color.accent : undefined}>
        {title}
      </Text>
      {children}
    </Box>
  );
}
