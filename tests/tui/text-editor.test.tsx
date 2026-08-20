/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import React, { act, useState } from "react";
import { testRender } from "@opentui/react/test-utils";
import { registerRendererTeardown, trackRenderer } from "./harness.js";
import { TextEditor } from "@/apps/cli/tui/primitives/TextEditor.js";

registerRendererTeardown();

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

  const setup = trackRenderer(await testRender(<Host />, { width: 40, height: 8 }));

  /**
   * Every render pass has to happen inside `act`, flush included: OpenTUI
   * commits frames asynchronously, so a bare `flush()` lets the state updates
   * it triggers escape React's batching — which is exactly what the "not
   * wrapped in act" warning reports.
   */
  const settle = async (): Promise<void> => {
    await act(async () => {
      await setup.flush();
    });
  };
  await settle();

  return {
    frame: () => setup.captureCharFrame(),
    type: async (text: string) => {
      await act(async () => {
        await setup.mockInput.typeText(text);
      });
      await settle();
    },
    setValue: (value: string) => {
      act(() => {
        external?.(value);
      });
    },
    value: () => latest,
    flush: settle,
  };
}

describe("TextEditor", () => {
  test("accepts typed text and reports it upward", async () => {
    const editor = await mountEditor();
    await editor.type("hello");

    expect(editor.value()).toBe("hello");
    expect(editor.frame()).toContain("hello");
  });

  test("leaves horizontal padding to its enclosing surface", async () => {
    const editor = await mountEditor();
    await editor.type("x");

    // PromptEditor already owns the panel padding. A local inset here would
    // create the detached, narrower input box this primitive is meant to avoid.
    expect(editor.frame().split("\n")[0]).toStartWith("x");
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

  test("handles accents and CJK, which a hand-rolled editor gets wrong", async () => {
    // The precise class of bug the previous editor could introduce: it drew a
    // cursor by appending a block character to a JavaScript string, so any
    // multi-byte grapheme desynchronised the display from the buffer.
    const editor = await mountEditor();
    await editor.type("eea");
    expect(editor.value()).toBe("eea");

    editor.setValue("éèà你好");
    await editor.flush();
    expect(editor.value()).toBe("éèà你好");
    expect(editor.frame()).toContain("你好");
  });

  test("keeps multiline content intact across an external replacement", async () => {
    const editor = await mountEditor("first line");
    editor.setValue("first line\nsecond line");
    await editor.flush();

    expect(editor.value()).toBe("first line\nsecond line");
    expect(editor.frame()).toContain("second line");
  });

  test("does not fight the cursor while typing", async () => {
    // Typing round-trips through `onChange` and back into `value`; if the
    // sync effect rewrote the buffer each time, characters would be lost.
    const editor = await mountEditor();
    await editor.type("abcdef");

    expect(editor.value()).toBe("abcdef");
  });
});
