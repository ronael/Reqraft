/* @jsxImportSource @opentui/react */
import { BoxRenderable, TextAttributes, type KeyEvent, type MouseEvent } from "@opentui/core";
import { useEffect, useRef, useState } from "react";
import { COLOR, type PanelTone, toneColor } from "../theme/tui.js";

/**
 * A focusable, activatable control.
 *
 * The whole bordered surface is the hitbox: clicking anywhere on it focuses
 * and activates the button, Enter/Space activate it from the keyboard, and
 * the focused state is visible (accent border + bold label). `disabled`
 * removes every interaction and dims the control.
 */

export interface ButtonProps {
  label: React.ReactNode;
  onActivate: () => void;
  /** Right-aligned dimmed shortcut hint (e.g. "^P"). */
  hint?: string;
  disabled?: boolean;
  /** Border tone; defaults to the soft border. */
  tone?: PanelTone;
  onFocusChange?: (focused: boolean) => void;
  ref?: (box: BoxRenderable | null) => void;
}

export function Button({
  label,
  onActivate,
  hint,
  disabled = false,
  tone = "neutral",
  onFocusChange,
  ref,
}: ButtonProps): React.ReactNode {
  const box = useRef<BoxRenderable | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const callbacks = useRef({ onActivate, onFocusChange });
  callbacks.current = { onActivate, onFocusChange };

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

  const activate = (): void => {
    if (!disabled) callbacks.current.onActivate();
  };

  const handleKeyDown = (key: KeyEvent): void => {
    if (key.name === "return" || key.name === "space") {
      key.preventDefault();
      activate();
    }
  };

  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || disabled) return;
    box.current?.focus();
    setPressed(true);
  };

  const handleMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const wasPressed = pressed;
    setPressed(false);
    if (wasPressed) activate();
  };

  const active = hovered || focused;
  const borderColor = disabled
    ? COLOR.borderSoft
    : pressed
      ? COLOR.accentStrong
      : active
        ? COLOR.accent
        : toneColor(tone);
  const labelColor = disabled ? COLOR.muted : active ? COLOR.accent : COLOR.text;

  return (
    <box
      focusable={!disabled}
      flexDirection="row"
      border={true}
      borderStyle={focused ? "double" : "single"}
      borderColor={borderColor}
      backgroundColor={pressed && !disabled ? COLOR.panelSoft : COLOR.bg}
      paddingLeft={1}
      paddingRight={1}
      columnGap={1}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseOver={() => !disabled && setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onKeyDown={handleKeyDown}
      ref={(renderable: BoxRenderable | null) => {
        box.current = renderable;
        ref?.(renderable);
      }}
    >
      <text fg={labelColor} attributes={active && !disabled ? TextAttributes.BOLD : undefined}>
        {label}
      </text>
      {hint !== undefined && (
        <text fg={disabled ? COLOR.borderSoft : COLOR.accent}>{hint}</text>
      )}
    </box>
  );
}
