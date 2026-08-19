/* @jsxImportSource @opentui/react */
import React from "react";
import { theme } from "@/apps/cli/tui/theme/index.js";

export type ToastTone = "success" | "neutral";

export interface ToastProps {
  message: string;
  tone?: ToastTone;
}

/**
 * Transient feedback.
 *
 * Rendered as a floating line over the transcript so an action like "copied"
 * is confirmed without changing context or opening a modal. The tone maps to
 * the same semantic colours as everywhere else — no literal hex here.
 */
export function Toast({ message, tone = "neutral" }: Readonly<ToastProps>): React.ReactNode {
  const { color } = theme.tokens;
  return (
    <box
      style={{
        position: "absolute",
        alignSelf: "center",
        bottom: 2,
        border: true,
        borderStyle: "single",
        borderColor: tone === "success" ? color.success : color.border,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: color.surfaceRaised,
        zIndex: 30,
      }}
    >
      <text fg={tone === "success" ? color.success : color.text}>{message}</text>
    </box>
  );
}
