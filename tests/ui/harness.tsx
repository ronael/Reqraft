/* @jsxImportSource @opentui/react */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Renderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";

// The OpenTUI test renderer drives React outside of act(); the updates are
// flushed explicitly, so the act() warnings are pure noise here.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

export type TestSetup = Awaited<ReturnType<typeof import("@opentui/react/test-utils").testRender>>;

/**
 * Wraps a tree in a real keymap created from the test renderer, the same way
 * the app creates one. Components under test therefore run against the same
 * interaction stack as the product.
 */
export function KeymapHarness({ children }: { children: ReactNode }): React.ReactNode {
  const renderer = useRenderer();
  const [keymap, setKeymap] = useState<Awaited<ReturnType<typeof createDefaultOpenTuiKeymap>> | null>(null);

  useEffect(() => {
    setKeymap(createDefaultOpenTuiKeymap(renderer));
  }, [renderer]);

  if (!keymap) return <box />;
  return <KeymapProvider keymap={keymap}>{children}</KeymapProvider>;
}

export async function mountUi(
  node: ReactNode,
  options?: { width?: number; height?: number },
): Promise<TestSetup> {
  const { testRender } = await import("@opentui/react/test-utils");
  return testRender(<KeymapHarness>{node}</KeymapHarness>, {
    width: options?.width ?? 100,
    height: options?.height ?? 30,
  });
}

/**
 * Presses a key until the frame reacts. A keystroke needs a little wall-clock
 * time to travel through the parser and React before the next frame shows it,
 * and the very first one after mount is sometimes swallowed.
 */
export async function untilFrame(
  setup: TestSetup,
  predicate: (frame: string) => boolean,
  label: string,
  attempts = 20,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await setup.flush();
    if (predicate(setup.captureCharFrame())) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`frame jamais attendue : ${label}\n${setup.captureCharFrame()}`);
}

export async function settle(setup: TestSetup): Promise<void> {
  await setup.flush();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await setup.flush();
}

/** Clicks at a renderable's center. */
export async function clickRenderable(setup: TestSetup, target: Renderable): Promise<void> {
  const x = target.screenX + Math.floor(target.width / 2);
  const y = target.screenY + Math.floor(target.height / 2);
  await setup.mockMouse.click(x, y);
  await settle(setup);
}

/** Clicks at an offset inside a renderable (for full-surface hitbox checks). */
export async function clickAt(
  setup: TestSetup,
  target: Renderable,
  offsetX: number,
  offsetY: number,
): Promise<void> {
  await setup.mockMouse.click(target.screenX + offsetX, target.screenY + offsetY);
  await settle(setup);
}
