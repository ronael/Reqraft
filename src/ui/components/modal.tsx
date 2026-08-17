/* @jsxImportSource @opentui/react */
import { TextAttributes, type Renderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { useKeymap } from "@opentui/keymap/react";
import { useEffect, useRef } from "react";
import { captureFocus, restoreFocus } from "../interaction/focus.js";
import { MODAL_LAYER_PRIORITY } from "../interaction/keys.js";
import { COLOR } from "../theme/tui.js";

/**
 * A modal dialog.
 *
 * Contract:
 * - on open, the previously focused element is captured and blurred;
 * - while open, a keymap layer (above the base layer) claims Escape, and the
 *   app's base shortcuts stay inert through their own `modalOpen` condition;
 * - the backdrop neutralizes the screen behind: clicking it closes the modal,
 *   clicks inside the content do not;
 * - on close, focus is restored to the captured element if it is still
 *   mounted.
 *
 * The modal does not focus anything itself — the primary control (a Select,
 * a TextInput...) takes focus on mount, which is what the user should see.
 */

export interface ModalProps {
  title: string;
  onClose: () => void;
  /** Dimmed hint shown next to the title (e.g. "↑↓ navigate · Enter select"). */
  hint?: string;
  children: React.ReactNode;
  /** Content width; centered on screen. */
  width?: number;
}

export function Modal({ title, onClose, hint, children, width = 62 }: ModalProps): React.ReactNode {
  const renderer = useRenderer();
  const keymap = useKeymap();
  const captured = useRef<Renderable | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes the modal while it is mounted. Registered above the base
  // layer so it wins; unregistered on unmount.
  useEffect(() => {
    const dispose = keymap.registerLayer({
      priority: MODAL_LAYER_PRIORITY,
      bindings: [{ key: "escape", cmd: () => onCloseRef.current() }],
    });
    return dispose;
  }, [keymap]);

  // Focus capture on open, restore on close.
  useEffect(() => {
    captured.current = captureFocus(renderer);
    captured.current?.blur();
    return () => {
      restoreFocus(renderer, captured.current);
    };
  }, [renderer]);

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={10}
      alignItems="center"
      justifyContent="center"
      backgroundColor="rgba(0,0,0,150)"
      onMouseUp={() => onCloseRef.current()}
    >
      <box
        width={width}
        border={true}
        borderStyle="double"
        borderColor={COLOR.accent}
        backgroundColor={COLOR.panelSoft}
        padding={1}
        flexDirection="column"
        rowGap={1}
        onMouseUp={(event: { stopPropagation(): void }) => event.stopPropagation()}
      >
        <text>
          <span fg={COLOR.accent}>⌘ </span>
          <span attributes={TextAttributes.BOLD}>{title}</span>
          {hint !== undefined && <span attributes={TextAttributes.DIM}>{hint}</span>}
        </text>
        {children}
      </box>
    </box>
  );
}
