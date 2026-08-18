/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import React, { act, useState } from "react";
import { testRender } from "@opentui/react/test-utils";
import { TextEditor } from "@/apps/cli/tui/primitives/TextEditor.js";

/**
 * Interaction tests for the editor primitive.
 *
 * These run under Bun rather than Vitest: OpenTUI's renderer needs its native
 * FFI, which is not available on Node, so a Node-side mock would assert
 * nothing about the component that actually ships. `testRender` drives the
 * real renderer headlessly, wrapping renders in React's `act` so state
 * updates are flushed before anything is captured.
 */

interface Harness {
  frame: () => string;
  type: (text: string) => Promise<void>;
  setValue: (value: string) => void;
  value: () => string;
  flush: () => Promise<void>;
}

async function mountEditor(initial = ""): Promise<Harness> {
  let external: ((value: string) => void) | null = null;
  let latest = initial;

  function Host(): React.ReactNode {
    const [value, setValue] = useState(initial);
    external = setValue;
    latest = value;
    return <TextEditor value={value} focused onChange={setValue} />;
  }

  const setup = await testRender(<Host />, { width: 40, height: 8 });
  await setup.flush();

  return {
    frame: () => setup.captureCharFrame(),
    type: async (text: string) => {
      await act(async () => {
        await setup.mockInput.typeText(text);
      });
      await setup.flush();
    },
    setValue: (value: string) => {
      act(() => {
        external?.(value);
      });
    },
    value: () => latest,
    flush: () => setup.flush(),
  };
}

describe("TextEditor", () => {
  test("accepts typed text and reports it upward", async () => {
    const editor = await mountEditor();
    await editor.type("hello");

    expect(editor.value()).toBe("hello");
    expect(editor.frame()).toContain("hello");
  });

  test("follows an external value change, so a reset actually clears", async () => {
    // The regression this locks: `initialValue` is latched by OpenTUI after
    // the first render, so without an explicit sync the editor would keep
    // showing "foo" forever.
    const editor = await mountEditor("foo");
    expect(editor.frame()).toContain("foo");

    editor.setValue("bar");
    await editor.flush();

    expect(editor.frame()).toContain("bar");
    expect(editor.frame()).not.toContain("foo");
  });

  test("clears completely when the value becomes empty", async () => {
    const editor = await mountEditor("session text");
    editor.setValue("");
    await editor.flush();

    expect(editor.frame()).not.toContain("session text");
  });

  test("does not fight the cursor while typing", async () => {
    // Typing round-trips through `onChange` and back into `value`; if the
    // sync effect rewrote the buffer each time, characters would be lost.
    const editor = await mountEditor();
    await editor.type("abcdef");

    expect(editor.value()).toBe("abcdef");
  });
});
