/* @jsxImportSource @opentui/react */
import React from "react";
import { Surface } from "./Surface.js";
import { theme } from "@/apps/cli/tui/theme/index.js";

export interface DialogProps {
  title: string;
  open: boolean;
  /** Terminal width, used to size the dialog from the design tokens. */
  terminalWidth: number;
  children?: React.ReactNode;
}

/**
 * Modal surface.
 *
 * Draws itself and nothing else: capturing the keyboard is the router's job
 * (`routeKey` refuses to let keys through while an overlay is open) and
 * restoring focus is the focus model's. Keeping those out of here is what
 * lets both be tested without rendering a dialog at all.
 */
export function Dialog({
  title,
  open,
  terminalWidth,
  children,
}: Readonly<DialogProps>): React.ReactNode {
  if (!open) return null;

  const { dialog } = theme.components;
  const width = Math.min(
    dialog.maximumWidth,
    Math.max(dialog.minimumWidth, Math.floor(terminalWidth * dialog.widthRatio)),
  );

  return (
    <box style={{ width, flexDirection: "column" }}>
      <Surface title={title} tone="accent" focused>
        {children}
      </Surface>
    </box>
  );
}
