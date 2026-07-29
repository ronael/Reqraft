import React from "react";
import { Box, Text } from "ink";
import type { QualityAssessment } from "../../core/types.js";
import { Notice } from "./notice.js";

export function qualitySignalViewKey(
  signal: QualityAssessment["signals"][number],
  index: number,
): string {
  return `${signal.code}:${String(index)}`;
}

export function QualityNotice({
  quality,
}: Readonly<{
  quality: QualityAssessment;
}>): React.JSX.Element | null {
  if (quality.status === "good") return null;

  const tone = quality.status === "risky" ? "danger" : "warning";
  const title =
    quality.status === "risky" ? "Résultat potentiellement incomplet" : "Qualité à vérifier";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Notice tone={tone}>{title}</Notice>
      {quality.signals
        .filter((signal) => signal.severity !== "info")
        .map((signal, index) => (
          <Text key={qualitySignalViewKey(signal, index)} dimColor>
            - {signal.message}
          </Text>
        ))}
    </Box>
  );
}
