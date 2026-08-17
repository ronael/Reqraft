/* @jsxImportSource @opentui/react */
import { useEffect, useState } from "react";
import { COLOR } from "../ui/theme/tui.js";

/**
 * Scan line (CLI v2, docs/design/cli-v2.md): the landing's hero scan becomes
 * the waiting indicator — a bright segment sweeping the line replaces the
 * spinner. One terminal row, two brand colours from the shared palette.
 */

const SEGMENT = 8;
const INTERVAL_MS = 55;

export function ScanLine({ width }: Readonly<{ width: number }>): React.ReactNode {
  const columns = Math.max(12, width - 2);
  const [head, setHead] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setHead((previous) => (previous + 1) % (columns + SEGMENT * 2));
    }, INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [columns]);

  const start = head - SEGMENT;
  const leadStart = Math.max(0, start);
  const leadEnd = Math.min(columns, head);
  const trailEnd = Math.min(columns, start + SEGMENT);

  // Three tones: bright head, soft trail, dormant line.
  const dormant = (count: number): string => "─".repeat(Math.max(0, count));
  const leadCount = Math.max(0, leadEnd - leadStart);
  const trailCount = Math.max(0, trailEnd - leadEnd);

  return (
    <text>
      <span fg={COLOR.borderSoft}>{dormant(leadStart)}</span>
      <span fg={COLOR.accent}>{"─".repeat(trailCount)}</span>
      <span fg={COLOR.accentStrong}>{"─".repeat(leadCount)}</span>
      <span fg={COLOR.borderSoft}>{dormant(columns - trailEnd)}</span>
    </text>
  );
}
