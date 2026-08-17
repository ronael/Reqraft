/* @jsxImportSource @opentui/react */
import { useRef, useState } from "react";
import { TextareaRenderable } from "@opentui/core";
import { expect, test } from "bun:test";
import { TextInput, type TextInputHandle } from "../../src/ui/components/index.js";
import { mountUi, settle, untilFrame } from "./harness.js";

function EditProbe({
  initial = "",
  disabled = false,
  error = false,
  placeholder,
  onEdit,
  onHandle,
}: {
  initial?: string;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
  onEdit: (value: string) => void;
  onHandle?: (handle: TextInputHandle | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const submits = useRef(0);
  return (
    <TextInput
      value={value}
      onChange={(next) => {
        setValue(next);
        onEdit(next);
      }}
      onSubmit={() => {
        submits.current += 1;
        onEdit(`submitted:${String(submits.current)}`);
      }}
      disabled={disabled}
      error={error}
      placeholder={placeholder}
      rows={4}
      width={60}
      autoFocus
      inputRef={(handle) => onHandle?.(handle)}
    />
  );
}

test("TextInput: type, move the caret, edit in the middle", async () => {
  const setup = await mountUi(<EditProbe onEdit={() => undefined} />);

  await untilFrame(setup, (frame) => frame.includes("reqraft") || true, "mount");
  await setup.mockInput.typeText("hello", 30);
  await untilFrame(setup, (frame) => frame.includes("hello"), "typed hello");

  setup.mockInput.pressArrow("left");
  await settle(setup);
  setup.mockInput.pressArrow("left");
  await settle(setup);
  setup.mockInput.typeText("!", 30);
  await untilFrame(setup, (frame) => frame.includes("he!llo"), "edited in the middle");

  const input = setup.renderer.currentFocusedRenderable as TextareaRenderable | null;
  expect(input).toBeInstanceOf(TextareaRenderable);
  expect(input?.plainText).toBe("he!llo");
});

test("TextInput: Backspace deletes at the caret", async () => {
  const holder: { handle: TextInputHandle | null } = { handle: null };
  const setup = await mountUi(
    <EditProbe initial="abc" onEdit={() => undefined} onHandle={(handle) => (holder.handle = handle)} />,
  );

  await untilFrame(setup, () => holder.handle !== null, "mounted");
  holder.handle!.focus();
  await settle(setup);
  expect(setup.renderer.currentFocusedRenderable).toBe(holder.handle!.renderable);

  setup.mockInput.pressBackspace();
  await untilFrame(setup, (frame) => !frame.includes("abc") && frame.includes("ab"), "backspace");
});

test("TextInput: Enter submits, backslash+Enter inserts a newline", async () => {
  let submitted = 0;
  const holder: { handle: TextInputHandle | null } = { handle: null };
  const setup = await mountUi(
    <EditProbe
      initial="ligne un\\"
      onEdit={(value) => {
        if (value.startsWith("submitted:")) submitted = Number(value.slice(10));
      }}
      onHandle={(handle) => (holder.handle = handle)}
    />,
  );

  await untilFrame(setup, () => holder.handle !== null, "mounted");
  holder.handle!.focus();
  await settle(setup);
  await untilFrame(setup, (frame) => frame.includes("ligne un"), "initial value");
  setup.mockInput.pressEnter();
  await untilFrame(setup, (frame) => frame.includes("ligne un\n"), "newline inserted");
  expect(submitted).toBe(0);

  setup.mockInput.pressEnter();
  await untilFrame(setup, () => submitted === 1, "submitted");
  expect(submitted).toBe(1);
});

test("TextInput: paste inserts at the caret", async () => {
  const holder: { handle: TextInputHandle | null } = { handle: null };
  const setup = await mountUi(
    <EditProbe initial="ab" onEdit={() => undefined} onHandle={(handle) => (holder.handle = handle)} />,
  );

  await untilFrame(setup, () => holder.handle !== null, "mounted");
  holder.handle!.focus();
  await settle(setup);
  await untilFrame(setup, (frame) => frame.includes("ab"), "initial value");
  setup.mockInput.pressArrow("left");
  await settle(setup);
  await setup.mockInput.pasteBracketedText("XY");
  await untilFrame(setup, (frame) => frame.includes("aXYb"), "pasted in the middle");
});

test("TextInput: disabled input ignores typing", async () => {
  const setup = await mountUi(<EditProbe initial="fixed" disabled onEdit={() => undefined} />);

  await untilFrame(setup, (frame) => frame.includes("fixed"), "initial value");
  setup.mockInput.typeText("zzz", 30);
  await settle(setup);
  const frame = setup.captureCharFrame();
  expect(frame.includes("zzz")).toBe(false);
});

test("TextInput: placeholder shows until the first character", async () => {
  const setup = await mountUi(<EditProbe placeholder="type here" onEdit={() => undefined} />);

  await untilFrame(setup, (frame) => frame.includes("type here"), "placeholder visible");
  setup.mockInput.typeText("a", 30);
  await untilFrame(setup, (frame) => !frame.includes("type here"), "placeholder gone");
});

test("TextInput: click focuses the input", async () => {
  const holder: { handle: TextInputHandle | null } = { handle: null };
  const setup = await mountUi(
    <EditProbe onEdit={() => undefined} onHandle={(handle) => (holder.handle = handle)} />,
  );
  await untilFrame(setup, () => holder.handle?.renderable !== null, "input mounted");
  const input = holder.handle!.renderable;

  // The input starts focused (autoFocus); blur it, then click to refocus.
  input?.blur();
  await settle(setup);
  expect(setup.renderer.currentFocusedRenderable).not.toBe(input);

  await setup.mockMouse.click(
    input!.screenX + 5,
    input!.screenY + 1,
  );
  await settle(setup);
  expect(setup.renderer.currentFocusedRenderable).toBe(input);
});

test("TextInput: unicode graphemes move the caret one cluster at a time", async () => {
  const setup = await mountUi(<EditProbe initial="é🚀" onEdit={() => undefined} />);

  await untilFrame(setup, (frame) => frame.includes("é🚀"), "initial value");
  const input = setup.renderer.currentFocusedRenderable as TextareaRenderable | null;
  expect(input?.cursorOffset).toBe(2);
  setup.mockInput.pressArrow("left");
  await settle(setup);
  expect(input?.cursorOffset).toBe(1);
  setup.mockInput.pressBackspace();
  await untilFrame(setup, (frame) => frame.includes("é") && !frame.includes("🚀"), "emoji deleted whole");
});
