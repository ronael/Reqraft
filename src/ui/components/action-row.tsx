/* @jsxImportSource @opentui/react */
import { BoxRenderable, TextAttributes, type KeyEvent, type MouseEvent } from "@opentui/core";
import { useEffect, useRef, useState } from "react";
import { COLOR } from "../theme/tui.js";

/**
 * A full-width interactive row for lists, menus and pickers.
 *
 * The entire row — not just the label — is the hitbox: hovering anywhere on
 * it reports hover, clicking anywhere activates it. Visual states:
 *
 * - `highlighted`: the row the keyboard cursor is on (accent, bold, "›");
 * - `selected`: a persistent choice marker ("●");
 * - hovered: the mouse is over the row;
 * - `disabled`: dimmed, inert.
 *
 * Inside a collection the parent owns the keyboard (the collection container
 * is the focus target); standalone, pass `focusable` and Enter/Space
 * activate the row.
 */

export interface ActionRowProps {
  /** Stable id, used by collections to scroll the row into view. */
  id?: string;
  label: React.ReactNode;
  /** Right-aligned dimmed hint (e.g. a shortcut). */
  hint?: string;
  highlighted?: boolean;
  selected?: boolean;
  /** External hover state, e.g. driven by a collection. */
  hovered?: boolean;
  disabled?: boolean;
  focusable?: boolean;
  onActivate?: () => void;
  onHoverChange?: (hovered: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
  ref?: (box: BoxRenderable | null) => void;
}

export function ActionRow({
  id,
  label,
  hint,
  highlighted = false,
  selected = false,
  hovered: hoveredProp = false,
  disabled = false,
  focusable = false,
  onActivate,
  onHoverChange,
  onFocusChange,
  ref,
}: ActionRowProps): React.ReactNode {
  const box = useRef<BoxRenderable | null>(null);
  const [mouseHovered, setMouseHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const callbacks = useRef({ onActivate, onHoverChange, onFocusChange });
  callbacks.current = { onActivate, onHoverChange, onFocusChange };

  useEffect(() => {
    const target = box.current;
    if (!target) return;
    const onFocused = (): void => {
      setFocused(true);
      callbacks.current.onFocusChange?.(true);
    };
    const onBlurred = (): void => {
      setFocused(false);
      callbacks.current.onFocusChange?.(false);
    };
    target.on("focused", onFocused);
    target.on("blurred", onBlurred);
    return () => {
      target.off("focused", onFocused);
      target.off("blurred", onBlurred);
    };
  }, []);

  const isHovered = mouseHovered || hoveredProp;
  const active = (highlighted || focused) && !disabled;

  const reportHover = (value: boolean): void => {
    setMouseHovered(value);
    callbacks.current.onHoverChange?.(value);
  };

  const activate = (): void => {
    if (!disabled) callbacks.current.onActivate?.();
  };

  const handleKeyDown = (key: KeyEvent): void => {
    if (key.name === "return" || key.name === "space") {
      key.preventDefault();
      activate();
    }
  };

  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || disabled) return;
    if (focusable) box.current?.focus();
  };

  const handleMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0 || disabled) return;
    activate();
  };

  const labelColor = disabled
    ? COLOR.muted
    : highlighted || focused
      ? COLOR.accent
      : isHovered
        ? COLOR.subtle
        : selected
          ? COLOR.success
          : COLOR.text;

  return (
    <box
      id={id}
      focusable={focusable && !disabled}
      flexDirection="row"
      columnGap={1}
      backgroundColor={highlighted && !disabled ? COLOR.panelSoft : COLOR.bg}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseOver={() => !disabled && reportHover(true)}
      onMouseOut={() => reportHover(false)}
      onKeyDown={focusable ? handleKeyDown : undefined}
      ref={(renderable: BoxRenderable | null) => {
        box.current = renderable;
        ref?.(renderable);
      }}
    >
      <text fg={disabled ? COLOR.borderSoft : highlighted || focused ? COLOR.accent : COLOR.muted}>
        {highlighted || focused ? "›" : " "}
      </text>
      <text fg={labelColor} attributes={active ? TextAttributes.BOLD : undefined} style={{ flexGrow: 1 }}>
        <span fg={selected && !disabled ? COLOR.success : COLOR.muted}>{selected ? "●" : "○"}</span>
        <span> </span>
        {label}
      </text>
      {hint !== undefined && <text fg={disabled ? COLOR.borderSoft : COLOR.accent}>{hint}</text>}
    </box>
  );
}
