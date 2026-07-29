import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme/tokens.js";

type NoticeTone = "success" | "warning" | "danger" | "info";

const prefixes: Record<NoticeTone, string> = {
  success: "OK  ",
  warning: "!   ",
  danger: "Erreur  ",
  info: "i   ",
};

export function Notice({
  tone,
  children,
}: Readonly<{
  tone: NoticeTone;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <Box marginBottom={1}>
      <Text color={theme.color[tone]}>
        {prefixes[tone]}
        {children}
      </Text>
    </Box>
  );
}
