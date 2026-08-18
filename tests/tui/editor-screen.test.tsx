/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import React, { act, useCallback, useMemo, useState } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { testRender } from "@opentui/react/test-utils";
import { KeyCodes, pasteBytes } from "@opentui/core/testing";
import { EditorScreen } from "@/apps/cli/tui/screens/EditorScreen.js";
import { useKeyboardRouting } from "@/apps/cli/tui/app/use-keyboard-routing.js";
import { Dialog } from "@/apps/cli/tui/primitives/Dialog.js";
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
 * `mockInput.pressKey` takes a KeyCodes name or a raw byte sequence — a
 * lowercase "tab" would arrive as the three letters t, a, b. Shift+Tab has no
 * KeyCodes entry, so it goes in as the CSI Z sequence a terminal sends.
 */
const SHIFT_TAB = `${KeyCodes.ESCAPE}[Z`;

/**
 * End-to-end interaction over the real renderer.
 *
 * Keys are injected through OpenTUI's own input path — `mockInput` writes the
 * bytes a terminal would write, `useKeyboard` parses them, and
 * `KeyboardController` routes them. Nothing here calls `routeKey` directly:
 * the pure-model tests in `tests/unit/tui-model.test.ts` already cover that,
 * and calling it here would prove only that the test knows its own answer.
 */

const SETTINGS = { profile: "auto", level: "standard", provider: "mock", model: "mock-model" };
const t = createTranslator("en");

interface HostOptions {
  result?: ResultState;
  width?: number;
  height?: number;
}

async function mountScreen(options: HostOptions = {}) {
  const { result = { kind: "empty" }, width = 120, height = 40 } = options;
  const commands: CommandId[] = [];
  let currentPrompt = "";
  let currentFocus: FocusState = INITIAL_FOCUS;

  function Host(): React.ReactNode {
    // Real renderer dimensions, so a resize actually reaches resolveLayout.
    const { width: termWidth, height: termHeight } = useTerminalDimensions();
    const [prompt, setPrompt] = useState("");
    const [focus, setFocus] = useState<FocusState>(INITIAL_FOCUS);
    const [overlay, setOverlay] = useState<string | null>(null);
    currentPrompt = prompt;
    currentFocus = focus;

    const onCommand = useCallback((id: CommandId) => {
      commands.push(id);
      const options = { hasResult: hasResult(result) };
      if (id === "focus-next") setFocus((f) => focusNext(f, options));
      if (id === "focus-previous") setFocus((f) => focusPrevious(f, options));
      if (id === "open-profile") {
        setOverlay("profile");
        setFocus(suspendFocus);
      }
      if (id === "close-overlay") {
        setOverlay(null);
        setFocus(restoreFocus);
      }
    }, []);

    const context = useMemo(
      () => ({
        hasOverlay: overlay !== null,
        hasResult: hasResult(result),
        isGenerating: isBusy(result),
        inputLength: prompt.length,
        editorFocused: focus.zone === "editor" && overlay === null,
      }),
      [overlay, prompt.length, focus.zone],
    );

    useKeyboardRouting(context, onCommand);

    return (
      <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
        <EditorScreen
          width={termWidth}
          height={termHeight}
          prompt={prompt}
          result={result}
          focus={focus}
          settings={SETTINGS}
          t={t}
          onPromptChange={setPrompt}
          onCommand={onCommand}
        />
        <Dialog title="profile" open={overlay !== null} terminalWidth={termWidth}>
          <text>{"overlay body"}</text>
        </Dialog>
      </box>
    );
  }

  const setup = await testRender(<Host />, { width, height });
  await setup.flush();

  /** Every helper drives the renderer, never the model. */
  const settle = async (): Promise<void> => {
    await act(async () => {
      await setup.flush();
    });
  };

  return {
    setup,
    frame: () => setup.captureCharFrame(),
    prompt: () => currentPrompt,
    focus: () => currentFocus,
    commands,
    settle,
    type: async (text: string): Promise<void> => {
      await act(async () => {
        await setup.mockInput.typeText(text);
      });
      await settle();
    },
    key: async (name: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}) => {
      await act(async () => {
        setup.mockInput.pressKey(name, modifiers);
        await setup.flush();
      });
      await settle();
    },
    /**
     * A lone Escape is ambiguous — it is also the first byte of every escape
     * sequence — so the parser holds it until the window expires. Real
     * terminals behave the same way; the delay is the point, not a workaround.
     */
    escape: async (): Promise<void> => {
      await act(async () => {
        await setup.mockInput.pressKeys([KeyCodes.ESCAPE], 30);
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
      await settle();
    },
    paste: async (text: string): Promise<void> => {
      await act(async () => {
        setup.renderer.stdin.emit("data", Buffer.from(pasteBytes(text)));
        await setup.flush();
      });
      await settle();
    },
    resize: async (nextWidth: number, nextHeight: number): Promise<void> => {
      await act(async () => {
        setup.resize(nextWidth, nextHeight);
        await setup.flush();
      });
      await settle();
    },
  };
}

describe("EditorScreen · rendering", () => {
  test("renders the toolbar, both panels and the status bar", async () => {
    const screen = await mountScreen();
    const frame = screen.frame();

    expect(frame).toContain("mock-model");
    // Shortcut labels come from the registry, not from literals in the view.
    expect(frame).toContain("^G");
  });

  test("shows the streaming partial, then the finished text", async () => {
    const streaming = await mountScreen({ result: { kind: "streaming", partial: "half way" } });
    expect(streaming.frame()).toContain("half way");

    const done = await mountScreen({ result: { kind: "success", text: "finished output" } });
    expect(done.frame()).toContain("finished output");
  });

  test("renders an error state without collapsing the layout", async () => {
    const screen = await mountScreen({
      result: { kind: "error", title: "Provider failed", message: "network unreachable" },
    });
    expect(screen.frame()).toContain("Provider failed");
  });
});

describe("EditorScreen · real keyboard", () => {
  test("typing reaches the prompt", async () => {
    const screen = await mountScreen();
    await screen.type("hello");

    expect(screen.prompt()).toBe("hello");
    expect(screen.frame()).toContain("hello");
  });

  test("a real Ctrl+G raises generate and leaves the prompt untouched", async () => {
    const screen = await mountScreen();
    await screen.type("draft");
    await screen.key("g", { ctrl: true });

    expect(screen.commands).toContain("generate");
    // The regression this exists for: the chord arriving as text, giving
    // "draftg" or a stray control character.
    expect(screen.prompt()).toBe("draft");
  });

  test("a real Tab and Shift+Tab walk the focus ring without typing", async () => {
    const screen = await mountScreen({ result: { kind: "success", text: "done" } });
    expect(screen.focus().zone).toBe("editor");

    await screen.key("TAB");
    expect(screen.focus().zone).toBe("result");

    await screen.key(SHIFT_TAB);
    expect(screen.focus().zone).toBe("editor");

    // Tab must never land in the buffer as whitespace.
    expect(screen.prompt()).toBe("");
  });

  test("a real Ctrl+V raises paste without inserting anything", async () => {
    const screen = await mountScreen();
    await screen.key("v", { ctrl: true });

    expect(screen.commands).toContain("paste");
    expect(screen.prompt()).toBe("");
  });

  test("bracketed paste inserts exactly once, natively", async () => {
    const screen = await mountScreen();
    await screen.paste("hello");

    expect(screen.prompt()).toBe("hello");
    // Proof the two paste paths do not both fire.
    expect(screen.commands).not.toContain("paste");
  });
});

describe("EditorScreen · overlay", () => {
  test("captures the keyboard, then restores focus and typing on escape", async () => {
    const screen = await mountScreen({ result: { kind: "success", text: "done" } });

    await screen.key("p", { ctrl: true });
    expect(screen.commands).toContain("open-profile");
    expect(screen.focus().suspended).toBe("editor");
    expect(screen.frame()).toContain("overlay body");

    // While the overlay holds the keyboard, ordinary keys reach nothing.
    await screen.type("z");
    expect(screen.prompt()).toBe("");

    await screen.escape();
    expect(screen.commands).toContain("close-overlay");
    expect(screen.focus()).toEqual({ zone: "editor", suspended: null });
    expect(screen.frame()).not.toContain("overlay body");

    // Focus is genuinely back: the editor accepts input again.
    await screen.type("x");
    expect(screen.prompt()).toBe("x");
  });
});

describe("EditorScreen · responsive", () => {
  const sizes = [
    [120, 40],
    [100, 30],
    [80, 24],
    [60, 16],
    [30, 8],
  ] as const;

  test("survives every reference size without crashing", async () => {
    const screen = await mountScreen();
    for (const [width, height] of sizes) {
      await screen.resize(width, height);
      expect(typeof screen.frame()).toBe("string");
    }
  });

  test("drops the toolbar and status bar as the terminal shrinks", async () => {
    const screen = await mountScreen();

    await screen.resize(120, 40);
    const wide = screen.frame();
    expect(wide).toContain("mock-model");
    expect(wide).toContain("^G");

    // Compact keeps shortcuts but drops metadata.
    await screen.resize(80, 24);
    expect(screen.frame()).toContain("^G");

    // Below the minimum, optional rows go rather than overflow.
    await screen.resize(30, 8);
    expect(screen.frame()).not.toContain("^G");
  });
});
