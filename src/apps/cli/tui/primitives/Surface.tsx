/* @jsxImportSource @opentui/react */
import type { Density, SurfaceTone } from "@/apps/cli/tui/theme/components.js";
import { toneBorderColor, toneTextColor } from "@/apps/cli/tui/theme/components.js";
import { theme } from "@/apps/cli/tui/theme/index.js";
import { TextAttributes } from "@opentui/core";
import React from "react";

export interface SurfaceProps {
  title?: string;
  meta?: string;
  tone?: SurfaceTone;
  density?: Density;
  focused?: boolean;
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
  title,
  meta,
  tone = "default",
  density = "comfortable",
  focused = false,
  bare = false,
  children,
}: Readonly<SurfaceProps>): React.ReactNode {
  const { tokens, components } = theme;
  const border = toneBorderColor(tokens, tone, focused);

  return (
    <box
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
