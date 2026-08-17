/* @jsxImportSource @opentui/react */
import { useRef } from "react";
import { BoxRenderable } from "@opentui/core";
import { expect, test } from "bun:test";
import { Button } from "../../src/ui/components/index.js";
import { clickAt, clickRenderable, mountUi, settle, untilFrame } from "./harness.js";

test("Button: focus + Enter activates exactly once", async () => {
  let activations = 0;
  const holder: { box: BoxRenderable | null } = { box: null };
  const setup = await mountUi(
    <Button
      label="Generate"
      hint="^G"
      onActivate={() => {
        activations += 1;
      }}
      ref={(box) => (holder.box = box)}
    />,
  );
  await untilFrame(setup, () => holder.box !== null, "button mounted");

  await clickRenderable(setup, holder.box!);
  expect(setup.renderer.currentFocusedRenderable).toBe(holder.box);
  expect(activations).toBe(1);

  setup.mockInput.pressEnter();
  await settle(setup);
  expect(activations).toBe(2);

  setup.mockInput.pressKey(" ");
  await settle(setup);
  expect(activations).toBe(3);
});

test("Button: the whole surface is clickable", async () => {
  let activations = 0;
  const holder: { box: BoxRenderable | null } = { box: null };
  const setup = await mountUi(
    <Button
      label="A rather long label to see how the button stretches"
      onActivate={() => {
        activations += 1;
      }}
      ref={(box) => (holder.box = box)}
    />,
  );
  await untilFrame(setup, () => holder.box !== null, "button mounted");

  // Far left of the surface (inside the border).
  await clickAt(setup, holder.box!, 1, 0);
  expect(activations).toBe(1);
  // Far right of the surface.
  await clickAt(setup, holder.box!, holder.box!.width - 2, 0);
  expect(activations).toBe(2);
});

test("Button: disabled ignores clicks and keys", async () => {
  let activations = 0;
  const holder: { box: BoxRenderable | null } = { box: null };
  const setup = await mountUi(
    <Button
      label="Disabled"
      disabled
      onActivate={() => {
        activations += 1;
      }}
      ref={(box) => (holder.box = box)}
    />,
  );
  await untilFrame(setup, () => holder.box !== null, "button mounted");

  await clickRenderable(setup, holder.box!);
  setup.mockInput.pressEnter();
  await settle(setup);
  expect(activations).toBe(0);
});

test("Button: hover state is visible", async () => {
  const holder: { box: BoxRenderable | null } = { box: null };
  const setup = await mountUi(
    <Button label="Hover me" onActivate={() => undefined} ref={(box) => (holder.box = box)} />,
  );
  await untilFrame(setup, () => holder.box !== null, "button mounted");

  const before = setup.captureCharFrame();
  await setup.mockMouse.moveTo(holder.box!.screenX + 3, holder.box!.screenY + 0);
  await settle(setup);
  const after = setup.captureCharFrame();
  // The accent border replaces the soft one on hover.
  expect(after).not.toBe(before);
});
