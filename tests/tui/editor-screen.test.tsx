/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import React, { act, useCallback, useState } from "react";
import { testRender } from "@opentui/react/test-utils";
import { EditorScreen } from "@/apps/cli/tui/screens/EditorScreen.js";
import { routeKey } from "@/apps/cli/tui/model/keymap.js";
import {
  INITIAL_FOCUS,
  focusNext,
  focusPrevious,
  restoreFocus,
  suspendFocus,
  type FocusState,
} from "@/apps/cli/tui/model/focus.js";
import { hasResult, isBusy, type ResultState } from "@/apps/cli/tui/model/result-state.js";
import type { CommandId } from "@/apps/cli/tui/model/commands.js";
import { createTranslator } from "@/i18n/translate.js";

/**
 * End-to-end interaction over the real renderer.
 *
 * The screen is wired here the way the app will wire it: keys go through
 * `routeKey`, focus through the focus model, and nothing else listens. That is
 * the point of these tests — they prove the V2 pieces work together, not that
 * each one works alone.
 */

const SETTINGS = { profile: "auto", level: "standard", provider: "mock", model: "mock-model" };

async function mountScreen(initialResult: ResultState = { kind: "empty" }) {
  const commands: CommandId[] = [];
  let currentPrompt = "";
  let currentFocus: FocusState = INITIAL_FOCUS;
  let dispatch: ((id: CommandId) => void) | null = null;

  function Host(): React.ReactNode {
    const [prompt, setPrompt] = useState("");
    const [focus, setFocus] = useState<FocusState>(INITIAL_FOCUS);
    const [result] = useState<ResultState>(initialResult);
    currentPrompt = prompt;
    currentFocus = focus;

    const onCommand = useCallback((id: CommandId) => {
      commands.push(id);
      if (id === "focus-next")
        setFocus((f) => focusNext(f, { hasResult: hasResult(initialResult) }));
      if (id === "focus-previous")
        setFocus((f) => focusPrevious(f, { hasResult: hasResult(initialResult) }));
      if (id === "open-profile") setFocus(suspendFocus);
      if (id === "close-overlay") setFocus(restoreFocus);
    }, []);
    dispatch = onCommand;

    return (
      <EditorScreen
        width={120}
        height={40}
        prompt={prompt}
        result={result}
        focus={focus}
        settings={SETTINGS}
        t={createTranslator("en")}
        onPromptChange={setPrompt}
        onCommand={onCommand}
      />
    );
  }

  const setup = await testRender(<Host />, { width: 120, height: 40 });
  await setup.flush();

  /** Routes a key exactly as the app will: a command, or text, never both. */
  const press = async (name: string, ctrl = false): Promise<void> => {
    const route = routeKey(
      { ctrl, name },
      {
        hasOverlay: currentFocus.suspended !== null,
        hasResult: hasResult(initialResult),
        isGenerating: isBusy(initialResult),
        inputLength: currentPrompt.length,
        editorFocused: currentFocus.zone === "editor",
      },
    );
    await act(async () => {
      if (route.kind === "command") {
        // Route straight to the screen's own handler: that is the path the
        // app will use, and it is what moves focus.
        dispatch?.(route.id);
      } else if (route.kind === "insert") {
        await setup.mockInput.typeText(name);
      } else {
        // `ignored`: an overlay swallowed the key, or nothing claimed it.
      }
      await setup.flush();
    });
    await setup.flush();
  };

  return {
    setup,
    frame: () => setup.captureCharFrame(),
    prompt: () => currentPrompt,
    focus: () => currentFocus,
    commands,
    press,
    type: async (text: string) => {
      await act(async () => {
        await setup.mockInput.typeText(text);
        await setup.flush();
      });
      await setup.flush();
    },
  };
}

describe("EditorScreen", () => {
  test("renders the toolbar, both panels and the status bar", async () => {
    const screen = await mountScreen();
    const frame = screen.frame();

    expect(frame).toContain("prompt");
    expect(frame).toContain("result");
    expect(frame).toContain("mock-model");
    // Shortcut labels come from the registry, not from literals in the view.
    expect(frame).toContain("^G");
  });

  test("typing reaches the prompt", async () => {
    const screen = await mountScreen();
    await screen.type("hello");

    expect(screen.prompt()).toBe("hello");
    expect(screen.frame()).toContain("hello");
  });

  test("Ctrl+G raises generate without leaking a character into the prompt", async () => {
    const screen = await mountScreen();
    await screen.type("draft");
    await screen.press("g", true);

    expect(screen.commands).toContain("generate");
    // The regression this exists for: a shortcut typed as text.
    expect(screen.prompt()).toBe("draft");
    expect(screen.prompt()).not.toContain("g");
  });

  test("an overlay captures the keyboard and gives focus back on escape", async () => {
    const screen = await mountScreen({ kind: "success", text: "done" });
    await screen.press("p", true);
    expect(screen.focus().suspended).toBe("editor");

    // While suspended, ordinary keys must not reach the prompt.
    await screen.press("z");
    expect(screen.prompt()).toBe("");

    await screen.press("escape");
    expect(screen.commands).toContain("close-overlay");
    expect(screen.focus()).toEqual({ zone: "editor", suspended: null });
  });

  test("shows the streaming partial, then the finished text", async () => {
    const streaming = await mountScreen({ kind: "streaming", partial: "half way" });
    expect(streaming.frame()).toContain("half way");

    const done = await mountScreen({ kind: "success", text: "finished output" });
    expect(done.frame()).toContain("finished output");
  });

  test("renders an error state without collapsing the layout", async () => {
    const screen = await mountScreen({
      kind: "error",
      title: "Provider failed",
      message: "network unreachable",
    });

    expect(screen.frame()).toContain("Provider failed");
    expect(screen.frame()).toContain("prompt");
  });

  test("survives a terminal far below the minimum size", async () => {
    const screen = await mountScreen();
    act(() => {
      screen.setup.resize(30, 8);
    });
    await screen.setup.flush();

    // Nothing to assert beyond "it rendered": the guarantee is no crash.
    expect(typeof screen.frame()).toBe("string");
  });
});
