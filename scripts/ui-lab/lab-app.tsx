/* @jsxImportSource @opentui/react */
import { useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeymap } from "@opentui/keymap/react";
import { useRenderer, useTerminalDimensions } from "@opentui/react";
import { COLOR } from "../../src/ui/theme/tui.js";
import { LabSceneList, type LabScene } from "./scene-list.js";

export interface LabAppProps {
  scenes: LabScene[];
  initialIndex: number;
}

/**
 * The UI Lab shell: a scene navigator on the left, the live scene on the
 * right. Esc quits; Up/Down move scenes while the navigator is focused, and
 * go to the focused control otherwise — the same focus model as the app.
 */
export function LabApp({ scenes, initialIndex }: LabAppProps): React.ReactNode {
  const renderer = useRenderer();
  const keymap = useKeymap();
  const { width, height } = useTerminalDimensions();
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), scenes.length - 1));

  useEffect(() => {
    const dispose = keymap.registerLayer({
      priority: 0,
      bindings: [{ key: "escape", cmd: () => renderer.stop() }],
    });
    return dispose;
  }, [keymap, renderer]);

  const scene = scenes[index] ?? scenes[0];
  if (!scene) return null;
  const Scene = scene.render;
  const listWidth = Math.min(34, Math.max(20, Math.floor(width * 0.3)));
  const listHeight = Math.max(6, height - 6);

  return (
    <box
      style={{
        width,
        height,
        flexDirection: "column",
        padding: 1,
        rowGap: 1,
        backgroundColor: COLOR.bg,
      }}
    >
      <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <text>
          <span fg={COLOR.accent} attributes={TextAttributes.BOLD}>
            REQRAFT UI LAB
          </span>
          <span attributes={TextAttributes.DIM}> — {scene.component} / {scene.name}</span>
        </text>
        <text attributes={TextAttributes.DIM}>↑↓ scenes · Esc quit</text>
      </box>

      <box style={{ flexDirection: "row", columnGap: 2, flexGrow: 1 }}>
        <box style={{ width: listWidth, flexShrink: 0 }}>
          <LabSceneList scenes={scenes} index={index} onSelect={setIndex} height={listHeight} />
        </box>
        <box
          style={{
            flexDirection: "column",
            rowGap: 1,
            flexGrow: 1,
            border: true,
            borderStyle: "single",
            borderColor: COLOR.border,
            padding: 1,
            overflow: "hidden",
          }}
        >
          <Scene />
          <box style={{ marginTop: 1 }}>
            <text fg={COLOR.muted} attributes={TextAttributes.DIM}>
              check: {scene.check}
            </text>
          </box>
        </box>
      </box>
    </box>
  );
}
