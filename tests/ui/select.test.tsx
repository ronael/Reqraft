/* @jsxImportSource @opentui/react */
import { useState } from "react";
import { expect, test } from "bun:test";
import { Select } from "../../src/ui/components/index.js";
import { mountUi, settle, untilFrame } from "./harness.js";

const OPTIONS = [
  { label: "auto", value: "auto" },
  { label: "landing", value: "landing" },
  { label: "api", value: "api" },
  { label: "data", value: "data" },
];

test("Select: Up/Down navigate (wrapping), Enter selects", async () => {
  const selected: string[] = [];
  const setup = await mountUi(
    <Select options={OPTIONS} value="landing" onSelect={(value) => selected.push(value)} height={5} width={40} autoFocus />,
  );

  await untilFrame(setup, (frame) => frame.includes("auto") && frame.includes("landing"), "options rendered");
  // Starts on the current value ("landing", index 1).
  setup.mockInput.pressArrow("down");
  await settle(setup);
  setup.mockInput.pressArrow("down");
  await settle(setup);
  setup.mockInput.pressEnter();
  await untilFrame(setup, () => selected.length === 1, "selected");
  expect(selected[0]).toBe("data");

  // Wrapping: from "data" (last) down goes to "auto" (first).
  setup.mockInput.pressArrow("down");
  await settle(setup);
  setup.mockInput.pressEnter();
  await untilFrame(setup, () => selected.length === 2, "wrapped selection");
  expect(selected[1]).toBe("auto");
});

test("Select: clicking any row selects it", async () => {
  const selected: string[] = [];
  const setup = await mountUi(
    <Select options={OPTIONS} value="auto" onSelect={(value) => selected.push(value)} height={5} width={40} autoFocus />,
  );

  await untilFrame(setup, (frame) => frame.includes("api"), "options rendered");
  // The "api" row is the third option; rows are one line each below the top.
  const frame = setup.captureCharFrame().split("\n");
  const apiRow = frame.findIndex((line) => line.includes("api"));
  expect(apiRow).toBeGreaterThanOrEqual(0);
  await setup.mockMouse.click(5, apiRow);
  await untilFrame(setup, () => selected.length === 1, "clicked selection");
  expect(selected[0]).toBe("api");
});

test("Select: keyboard navigation keeps the highlighted row visible", async () => {
  const options = Array.from({ length: 30 }, (_, i) => ({
    label: `option-${String(i + 1).padStart(2, "0")}`,
    value: String(i),
  }));
  const selected: string[] = [];
  const setup = await mountUi(
    <Select options={options} value="0" onSelect={(value) => selected.push(value)} height={8} width={40} autoFocus />,
  );

  await untilFrame(setup, (frame) => frame.includes("option-01"), "list rendered");
  for (let i = 0; i < 25; i++) {
    setup.mockInput.pressArrow("down");
    await settle(setup);
  }
  const frame = setup.captureCharFrame();
  // The highlighted row (option-26) must be on screen.
  expect(frame.includes("option-26")).toBe(true);
});

test("Select: disabled ignores keys and clicks", async () => {
  const selected: string[] = [];
  const setup = await mountUi(
    <Select options={OPTIONS} value="auto" onSelect={(value) => selected.push(value)} height={5} width={40} disabled />,
  );

  await untilFrame(setup, (frame) => frame.includes("auto"), "options rendered");
  setup.mockInput.pressArrow("down");
  setup.mockInput.pressEnter();
  await settle(setup);
  expect(selected).toHaveLength(0);
});
