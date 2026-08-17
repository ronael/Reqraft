/* @jsxImportSource @opentui/react */
import { BoxRenderable, ScrollBoxRenderable, type KeyEvent } from "@opentui/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionRow } from "./action-row.js";
import { ScrollArea } from "./scroll-area.js";

/**
 * A selectable list: the picker primitive.
 *
 * One focus target (the container) owns the keyboard — Up/Down move the
 * highlight (wrapping), Enter activates it, Home/End jump to the ends. Every
 * row is a full-width `ActionRow`, so the whole row is clickable: hovering
 * reports hover, clicking highlights and activates. The highlighted row is
 * kept visible by scrolling the content, and the current value carries the
 * persistent "●" marker.
 */

export interface SelectOption<T> {
  label: string;
  value: T;
  hint?: string;
  disabled?: boolean;
}

export interface SelectProps<T> {
  options: SelectOption<T>[];
  /** The current value, shown with the persistent marker. */
  value?: T;
  /** First highlighted row; defaults to the current value, else the first. */
  initialIndex?: number;
  onSelect: (value: T) => void;
  /** Visible rows; longer option lists scroll. */
  height: number;
  width?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function Select<T>({
  options,
  value,
  initialIndex,
  onSelect,
  height,
  width,
  autoFocus = false,
  disabled = false,
}: SelectProps<T>): React.ReactNode {
  const container = useRef<BoxRenderable | null>(null);
  const scroll = useRef<ScrollBoxRenderable | null>(null);
  const [highlighted, setHighlighted] = useState<number>(() => {
    const byValue = value === undefined ? -1 : options.findIndex((option) => option.value === value);
    if (initialIndex !== undefined) return Math.min(Math.max(0, initialIndex), Math.max(0, options.length - 1));
    return byValue >= 0 ? byValue : 0;
  });
  const [hovered, setHovered] = useState<number>(-1);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const rowIds = useMemo(() => options.map((_, index) => `select-row-${String(index)}`), [options]);

  const move = (delta: number): void => {
    if (disabled || options.length === 0) return;
    setHighlighted((previous) => {
      const next = (previous + delta + options.length) % options.length;
      keepVisible(next);
      return next;
    });
  };

  const jumpTo = (index: number): void => {
    if (disabled || options.length === 0) return;
    const next = Math.min(Math.max(0, index), options.length - 1);
    keepVisible(next);
    setHighlighted(next);
  };

  const keepVisible = (index: number): void => {
    const rowId = rowIds[index];
    if (rowId) scroll.current?.scrollChildIntoView(rowId);
  };

  const activate = (index: number): void => {
    const option = options[index];
    if (!option || option.disabled || disabled) return;
    onSelectRef.current(option.value);
  };

  const handleKeyDown = (key: KeyEvent): void => {
    if (key.name === "up") {
      key.preventDefault();
      move(-1);
    } else if (key.name === "down") {
      key.preventDefault();
      move(1);
    } else if (key.name === "home") {
      key.preventDefault();
      jumpTo(0);
    } else if (key.name === "end") {
      key.preventDefault();
      jumpTo(options.length - 1);
    } else if (key.name === "return" || key.name === "kpenter" || key.name === "linefeed") {
      key.preventDefault();
      activate(highlighted);
    }
  };

  useEffect(() => {
    const target = container.current;
    if (!target || !autoFocus || disabled) return;
    const timer = setTimeout(() => {
      if (!target.isDestroyed) target.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [autoFocus, disabled]);

  // Keep the highlight in range when the option list shrinks.
  useEffect(() => {
    if (highlighted >= options.length) setHighlighted(Math.max(0, options.length - 1));
  }, [options.length, highlighted]);

  return (
    <box
      focusable={!disabled}
      flexDirection="column"
      width={width}
      height={height}
      onKeyDown={handleKeyDown}
      onMouseDown={() => {
        if (!disabled) container.current?.focus();
      }}
      ref={(renderable: BoxRenderable | null) => {
        container.current = renderable;
      }}
    >
      <ScrollArea height={height} ref={(renderable) => (scroll.current = renderable)}>
        {options.map((option, index) => (
          <ActionRow
            key={rowIds[index]}
            id={rowIds[index]}
            label={option.label}
            hint={option.hint}
            highlighted={index === highlighted}
            selected={option.value === value}
            hovered={index === hovered}
            disabled={disabled || option.disabled === true}
            onActivate={() => {
              setHighlighted(index);
              activate(index);
            }}
            onHoverChange={(isHovered) => setHovered(isHovered ? index : -1)}
          />
        ))}
      </ScrollArea>
    </box>
  );
}
