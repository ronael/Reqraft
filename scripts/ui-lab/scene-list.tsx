/* @jsxImportSource @opentui/react */
import { useEffect, useRef, useState } from "react";
import { BoxRenderable, TextAttributes, type KeyEvent } from "@opentui/core";
import { COLOR } from "../../src/ui/theme/tui.js";
import { ActionRow } from "../../src/ui/components/index.js";

export interface LabScene {
  id: string;
  component: string;
  name: string;
  /** What to check in this scene, shown under the preview. */
  check: string;
  render: () => React.ReactNode;
}

export interface LabSceneListProps {
  scenes: LabScene[];
  index: number;
  onSelect: (index: number) => void;
  height: number;
}

/**
 * The lab's own scene navigator: a focusable list. Up/Down/Enter while it is
 * focused; clicking a row selects it. It demonstrates the same focus model
 * the app uses — when a scene's control has focus, the keys go to the control.
 */
export function LabSceneList({ scenes, index, onSelect, height }: LabSceneListProps): React.ReactNode {
  const box = useRef<BoxRenderable | null>(null);
  const [hovered, setHovered] = useState(-1);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const target = box.current;
    if (!target) return;
    const timer = setTimeout(() => {
      if (!target.isDestroyed) target.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const move = (delta: number): void => {
    const next = (index + delta + scenes.length) % scenes.length;
    onSelectRef.current(next);
  };

  const handleKeyDown = (key: KeyEvent): void => {
    if (key.name === "up") {
      key.preventDefault();
      move(-1);
    } else if (key.name === "down") {
      key.preventDefault();
      move(1);
    } else if (key.name === "return" || key.name === "kpenter" || key.name === "linefeed") {
      key.preventDefault();
      onSelectRef.current(index);
    }
  };

  return (
    <box
      ref={(renderable: BoxRenderable | null) => {
        box.current = renderable;
      }}
      focusable
      flexDirection="column"
      height={height}
      width="100%"
      border={true}
      borderStyle="single"
      borderColor={COLOR.border}
      padding={1}
      overflow="hidden"
      onMouseDown={() => box.current?.focus()}
      onKeyDown={handleKeyDown}
    >
      {scenes.map((scene, sceneIndex) => {
        const isCurrent = sceneIndex === index;
        const currentComponent = scenes[index]?.component;
        const isOtherComponent = !isCurrent && scene.component !== currentComponent;
        return (
          <box key={scene.id} flexDirection="column">
            {isOtherComponent && (
              <text fg={COLOR.accent} attributes={TextAttributes.BOLD} style={{ marginTop: 1 }}>
                {scene.component}
              </text>
            )}
            <ActionRow
              label={scene.name}
              highlighted={isCurrent}
              hovered={sceneIndex === hovered}
              onActivate={() => onSelectRef.current(sceneIndex)}
              onHoverChange={(value) => setHovered(value ? sceneIndex : -1)}
            />
          </box>
        );
      })}
    </box>
  );
}
