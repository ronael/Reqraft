/* @jsxImportSource @opentui/react */
import { BoxRenderable } from "@opentui/core";
import { expect, test } from "bun:test";
import { ActionRow } from "../../src/ui/components/index.js";
import { clickAt, mountUi, settle, untilFrame } from "./harness.js";

test("ActionRow: the whole row is clickable, left and right", async () => {
  let activations = 0;
  const holder: { box: BoxRenderable | null } = { box: null };
  const setup = await mountUi(
    <ActionRow
      label="a label in the middle of a wide row"
      onActivate={() => {
        activations += 1;
      }}
      ref={(box) => (holder.box = box)}
    />,
  );
  await untilFrame(setup, () => holder.box !== null, "row mounted");

  // Far left, before the label.
  await clickAt(setup, holder.box!, 1, 0);
  expect(activations).toBe(1);
  // Far right, after the label.
  await clickAt(setup, holder.box!, holder.box!.width - 2, 0);
  expect(activations).toBe(2);
});

test("ActionRow: hover anywhere on the row reports hover", async () => {
  const hovers: boolean[] = [];
  const holder: { box: BoxRenderable | null } = { box: null };
  const setup = await mountUi(
    <ActionRow
      label="hover target"
      onHoverChange={(value) => hovers.push(value)}
      ref={(box) => (holder.box = box)}
    />,
  );
  await untilFrame(setup, () => holder.box !== null, "row mounted");

  await setup.mockMouse.moveTo(holder.box!.screenX + 2, holder.box!.screenY + 0);
  await settle(setup);
  expect(hovers.at(-1)).toBe(true);

  await setup.mockMouse.moveTo(holder.box!.screenX + holder.box!.width - 3, holder.box!.screenY + 0);
  await settle(setup);
  expect(hovers.at(-1)).toBe(true);
});

test("ActionRow: focusable row activates on Enter", async () => {
  let activations = 0;
  const holder: { box: BoxRenderable | null } = { box: null };
  const setup = await mountUi(
    <ActionRow
      label="focusable"
      focusable
      onActivate={() => {
        activations += 1;
      }}
      ref={(box) => (holder.box = box)}
    />,
  );
  await untilFrame(setup, () => holder.box !== null, "row mounted");

  holder.box!.focus();
  await settle(setup);
  expect(setup.renderer.currentFocusedRenderable).toBe(holder.box);

  setup.mockInput.pressEnter();
  await settle(setup);
  expect(activations).toBe(1);
});

test("ActionRow: disabled row is inert", async () => {
  let activations = 0;
  const holder: { box: BoxRenderable | null } = { box: null };
  const setup = await mountUi(
    <ActionRow
      label="disabled"
      disabled
      onActivate={() => {
        activations += 1;
      }}
      ref={(box) => (holder.box = box)}
    />,
  );
  await untilFrame(setup, () => holder.box !== null, "row mounted");

  await clickAt(setup, holder.box!, 2, 0);
  await settle(setup);
  expect(activations).toBe(0);
});
