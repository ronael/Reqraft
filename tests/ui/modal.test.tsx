/* @jsxImportSource @opentui/react */
import { useState } from "react";
import { BoxRenderable } from "@opentui/core";
import { expect, test } from "bun:test";
import { Button, Modal, Select } from "../../src/ui/components/index.js";
import { clickRenderable, mountUi, settle, untilFrame } from "./harness.js";

function ModalFixture({
  onOpenChange,
  buttonRef,
}: {
  onOpenChange: (open: boolean) => void;
  buttonRef: (box: BoxRenderable | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("a");
  const openModal = (): void => {
    setOpen(true);
    onOpenChange(true);
  };
  const closeModal = (): void => {
    setOpen(false);
    onOpenChange(false);
  };
  return (
    <box flexDirection="column" rowGap={1}>
      <Button label="Open modal" onActivate={openModal} ref={buttonRef} />
      {open && (
        <Modal title="Pick" hint="  ↑↓ · Enter · Esc" onClose={closeModal} width={50}>
          <Select
            options={[
              { label: "option a", value: "a" },
              { label: "option b", value: "b" },
            ]}
            value={choice}
            onSelect={(value) => {
              setChoice(value);
              closeModal();
            }}
            height={3}
            width={44}
            autoFocus
          />
        </Modal>
      )}
    </box>
  );
}

test("Modal: focus is captured on open and restored on close", async () => {
  const holder: { button: BoxRenderable | null; open: boolean } = { button: null, open: false };
  const setup = await mountUi(
    <ModalFixture
      buttonRef={(box) => (holder.button = box)}
      onOpenChange={(open) => (holder.open = open)}
    />,
  );
  await untilFrame(setup, () => holder.button !== null, "button mounted");

  // 1. Focus element A (the button).
  holder.button!.focus();
  await settle(setup);
  expect(setup.renderer.currentFocusedRenderable).toBe(holder.button);

  // 2. Open the modal.
  setup.mockInput.pressEnter();
  await untilFrame(setup, () => holder.open, "modal open");
  await settle(setup);

  // 3. Focus moved into the modal (the Select container).
  const focusedInside = setup.renderer.currentFocusedRenderable;
  expect(focusedInside).not.toBe(holder.button);
  expect(focusedInside).not.toBe(null);

  // 4. Close with Escape.
  setup.mockInput.pressEscape();
  await untilFrame(setup, () => !holder.open, "modal closed");
  await settle(setup);

  // 5. Focus is back on A.
  expect(setup.renderer.currentFocusedRenderable).toBe(holder.button);
});

test("Modal: Escape closes, Enter selects from the list", async () => {
  const holder: { button: BoxRenderable | null; open: boolean } = { button: null, open: false };
  const setup = await mountUi(
    <ModalFixture
      buttonRef={(box) => (holder.button = box)}
      onOpenChange={(open) => (holder.open = open)}
    />,
  );
  await untilFrame(setup, () => holder.button !== null, "button mounted");

  holder.button!.focus();
  await settle(setup);
  setup.mockInput.pressEnter();
  await untilFrame(setup, () => holder.open, "modal open");
  await settle(setup);

  // Navigate to the second option and select it.
  setup.mockInput.pressArrow("down");
  await settle(setup);
  setup.mockInput.pressEnter();
  await untilFrame(setup, () => !holder.open, "selected closed the modal");
});

test("Modal: backdrop click closes, content click does not", async () => {
  const holder: { button: BoxRenderable | null; open: boolean } = { button: null, open: false };
  const setup = await mountUi(
    <ModalFixture
      buttonRef={(box) => (holder.button = box)}
      onOpenChange={(open) => (holder.open = open)}
    />,
  );
  await untilFrame(setup, () => holder.button !== null, "button mounted");

  holder.button!.focus();
  await settle(setup);
  setup.mockInput.pressEnter();
  await untilFrame(setup, () => holder.open, "modal open");
  await settle(setup);

  // Click the backdrop (top-left corner, far from the centered content).
  await setup.mockMouse.click(2, 2);
  await untilFrame(setup, () => !holder.open, "backdrop click closed");
});
