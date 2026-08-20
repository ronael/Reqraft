/* @jsxImportSource @opentui/react */
import type { Density, SurfaceTone } from "@/apps/cli/tui/theme/components.js";
import { toneBorderColor, toneTextColor } from "@/apps/cli/tui/theme/components.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { TextAttributes } from "@opentui/core";
import React from "react";

export interface SurfaceProps {
  id?: string;
  title?: string;
  meta?: string;
  tone?: SurfaceTone;
  density?: Density;
  focused?: boolean;
  /** Fixed panel height when a child needs an exact terminal-row budget. */
  height?: number;
  /** Handles clicks anywhere in the panel, including its title and padding. */
  onMouseDown?(): void;
  /** Drops the border for dense areas that are already inside a surface. */
  bare?: boolean;
  children?: React.ReactNode;
}

/**
 * The single panel primitive.
 *
 * Tone and density are variants rather than separate components: an error
 * panel and a default panel differ only in which token they read, so
 * `ErrorPanel`/`SuccessPanel` would be duplication with extra names to keep in
 * sync. Every colour and spacing value comes from the theme — nothing here is
 * a literal.
 */
export function Surface({
  id,
  title,
  meta,
  tone = "default",
  density = "comfortable",
  focused = false,
  height,
  onMouseDown,
  bare = false,
  children,
}: Readonly<SurfaceProps>): React.ReactNode {
  const { tokens, components } = theme;
  const border = toneBorderColor(tokens, tone, focused);

  return (
    <box
      id={id}
      onMouseDown={onMouseDown}
      style={{
        border: !bare,
        borderStyle: focused ? tokens.border.focused : tokens.border.default,
        borderColor: border,
        backgroundColor: tokens.color.surface,
        paddingLeft: components.surface.paddingX[density],
        paddingRight: components.surface.paddingX[density],
        paddingTop: components.surface.paddingY[density],
        paddingBottom: components.surface.paddingY[density],
        flexDirection: "column",
        flexGrow: 0,
        ...(height === undefined
          ? {}
          : { height, minHeight: height, maxHeight: height, flexShrink: 0 }),
      }}
    >
      {title !== undefined && (
        <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <text>
            <span fg={toneTextColor(tokens, tone)}>{"› "}</span>
            <span attributes={TextAttributes.BOLD} fg={tokens.color.text}>
              {title}
            </span>
          </text>
          {meta !== undefined && (
            <text attributes={TextAttributes.DIM} fg={tokens.color.textMuted}>
              {meta}
            </text>
          )}
        </box>
      )}
      {children}
    </box>
  );
}
