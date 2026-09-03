/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import React, { act, useCallback, useMemo, useState } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { testRender } from "@opentui/react/test-utils";
import { registerRendererTeardown, trackRenderer } from "./harness.js";
import { KeyCodes, pasteBytes } from "@opentui/core/testing";
import { EditorScreen } from "@/apps/cli/tui/screens/EditorScreen.js";
import { useKeyboardRouting } from "@/apps/cli/tui/app/use-keyboard-routing.js";
import {
  INITIAL_FOCUS,
  focusNext,
  focusPrevious,
  restoreFocus,
  suspendFocus,
  type FocusState,
} from "@/apps/cli/tui/model/focus.js";
import {
  INITIAL_OVERLAY,
  closeOverlay,
  moveSelection,
  openOverlay,
  setQuery,
  type OverlayState,
} from "@/apps/cli/tui/model/overlay.js";
import type { OverlayRoute } from "@/apps/cli/tui/model/keymap.js";
import { hasResult, isBusy, type ResultState } from "@/apps/cli/tui/model/result-state.js";
import type { CommandId } from "@/apps/cli/tui/model/commands.js";
import type { ResultViewMode } from "@/apps/cli/ui/result-view.js";
import { createTranslator } from "@/i18n/translate.js";

registerRendererTeardown();

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
  const { result: initialResult = { kind: "empty" }, width = 120, height = 40 } = options;
  const commands: CommandId[] = [];
  let currentPrompt = "";
  let currentFocus: FocusState = INITIAL_FOCUS;
  let currentView: ResultViewMode = "result";
  let externalSetFocus: ((value: FocusState) => void) | null = null;
  let externalSetOverlay: ((value: OverlayState) => void) | null = null;
  let externalSetResult: ((value: ResultState) => void) | null = null;
  let externalSetView: ((value: ResultViewMode) => void) | null = null;
  let externalSetSubmitted: ((value: string | null) => void) | null = null;

  function Host(): React.ReactNode {
    // Real renderer dimensions, so a resize actually reaches resolveLayout.
    const { width: termWidth, height: termHeight } = useTerminalDimensions();
    const [prompt, setPrompt] = useState("");
    const [focus, setFocus] = useState<FocusState>(INITIAL_FOCUS);
    const [overlay, setOverlay] = useState<OverlayState>(INITIAL_OVERLAY);
    const [result, setResult] = useState<ResultState>(initialResult);
    const [view, setView] = useState<ResultViewMode>("result");
    const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
    currentPrompt = prompt;
    currentFocus = focus;
    currentView = view;
    externalSetFocus = setFocus;
    externalSetOverlay = setOverlay;
    externalSetResult = setResult;
    externalSetView = setView;
    externalSetSubmitted = setSubmittedPrompt;

    const onCommand = useCallback(
      (id: CommandId) => {
        commands.push(id);
        const options = { hasResult: hasResult(result) };
        if (id === "focus-next") setFocus((f) => focusNext(f, options));
        if (id === "focus-previous") setFocus((f) => focusPrevious(f, options));
        if (id === "open-profile") {
          setOverlay(openOverlay("profile"));
          setFocus(suspendFocus);
        }
        if (id === "open-palette") {
          setOverlay(openOverlay("palette"));
          setFocus(suspendFocus);
        }
        if (id === "open-help") {
          setOverlay(openOverlay("help"));
          setFocus(suspendFocus);
        }
        if (id === "close-overlay") {
          setOverlay(closeOverlay);
          setFocus(restoreFocus);
        }
        if (id === "toggle-diff") setView((v) => (v === "diff" ? "result" : "diff"));
        if (id === "show-explain") setView("explain");
        if (id === "reset") {
          setResult({ kind: "empty" });
          setView("result");
          setFocus(INITIAL_FOCUS);
        }
      },
      [result],
    );

    const onOverlaySelect = useCallback(() => {
      setOverlay(closeOverlay);
      setFocus(restoreFocus);
    }, []);

    const onOverlayRoute = useCallback((route: OverlayRoute) => {
      if (route.kind === "overlay-nav") {
        setOverlay((state) => moveSelection(state, route.dir, 5));
      }
      if (route.kind === "overlay-type") {
        setOverlay((state) => setQuery(state, state.query + route.text));
      }
      if (route.kind === "overlay-backspace") {
        setOverlay((state) => setQuery(state, state.query.slice(0, -1)));
      }
      if (route.kind === "overlay-select") {
        setOverlay(closeOverlay);
        setFocus(restoreFocus);
      }
    }, []);

    const context = useMemo(
      () => ({
        hasOverlay: overlay.active !== null,
        hasResult: hasResult(result),
        isGenerating: isBusy(result),
        inputLength: prompt.length,
        editorFocused: focus.zone === "editor" && overlay.active === null,
      }),
      [overlay, prompt.length, focus.zone, result],
    );

    useKeyboardRouting(context, onCommand, onOverlayRoute);

    return (
      <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
        <EditorScreen
          width={termWidth}
          height={termHeight}
          prompt={prompt}
          submittedPrompt={submittedPrompt}
          result={result}
          view={view}
          focus={focus}
          overlay={overlay}
          settings={SETTINGS}
          ready
          toast={null}
          t={t}
          onPromptChange={setPrompt}
          onFocusEditor={() => {
            setFocus({ zone: "editor", suspended: null });
          }}
          onCommand={onCommand}
          onOverlaySelect={onOverlaySelect}
        />
      </box>
    );
  }

  const setup = trackRenderer(await testRender(<Host />, { width, height }));
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
    setFocus: (value: FocusState) => {
      act(() => {
        externalSetFocus?.(value);
      });
    },
    setOverlay: (value: OverlayState) => {
      act(() => {
        externalSetOverlay?.(value);
      });
    },
    view: () => currentView,
    commands,
    settle,
    setResult: (value: ResultState) => {
      act(() => {
        externalSetResult?.(value);
      });
    },
    setView: (value: ResultViewMode) => {
      act(() => {
        externalSetView?.(value);
      });
    },
    setSubmittedPrompt: (value: string | null) => {
      act(() => {
        externalSetSubmitted?.(value);
      });
    },
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
    clickPromptSurface: async (): Promise<void> => {
      const surface = setup.renderer.root.findDescendantById("prompt-editor-surface");
      if (surface === undefined) throw new Error("Prompt editor surface was not rendered");
      await act(async () => {
        // Click the heading rather than the textarea: the entire Surface must
        // activate the editor, not merely its content rows.
        await setup.mockMouse.click(surface.x + 1, surface.y + 1);
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
    expect(frame).toContain(t("tui.panel.prompt"));
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

  test("a click anywhere on the prompt surface restores editor focus", async () => {
    const screen = await mountScreen();
    screen.setFocus({ zone: "toolbar", suspended: null });
    expect(screen.focus().zone).toBe("toolbar");

    await screen.clickPromptSurface();
    expect(screen.focus().zone).toBe("editor");

    await screen.type("x");
    expect(screen.prompt()).toBe("x");
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
    // The profile picker opens (its title comes from the registry label).
    expect(screen.frame()).toContain(t("tui.changeProfile"));

    // While the overlay holds the keyboard, ordinary keys reach nothing.
    await screen.type("z");
    expect(screen.prompt()).toBe("");

    await screen.escape();
    expect(screen.commands).toContain("close-overlay");
    expect(screen.focus()).toEqual({ zone: "editor", suspended: null });
    expect(screen.frame()).not.toContain(t("tui.changeProfile"));

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

describe("EditorScreen · vertical transcript", () => {
  const SUCCESS: ResultState = {
    kind: "success",
    text: "Rewritten prompt here.",
    original: "Original prompt",
    changes: ["Clarified intent"],
    latencyMs: 1400,
    provider: "mock",
    model: "mock-model",
  };

  test("shows the user turn and the reqraft result stacked vertically", async () => {
    const screen = await mountScreen({ result: SUCCESS });
    await screen.type("Original prompt");
    const frame = screen.frame();

    expect(frame).toContain(t("tui.turn.you"));
    expect(frame).toContain(t("tui.turn.reqraft"));
    // The prompt stays visible as the "you" turn even once a result exists.
    expect(frame).toContain("Original prompt");
    expect(frame).toContain("Rewritten prompt here.");
  });

  test("switches the result body to a diff and back with Ctrl+D", async () => {
    const screen = await mountScreen({ result: SUCCESS });
    await screen.key("d", { ctrl: true });
    expect(screen.view()).toBe("diff");
    const frame = screen.frame();
    expect(frame).toContain("- Original prompt");
    expect(frame).toContain("+ Rewritten prompt here.");

    await screen.key("d", { ctrl: true });
    expect(screen.view()).toBe("result");
  });

  test("shows the explanation view on Ctrl+E", async () => {
    const screen = await mountScreen({ result: SUCCESS });
    await screen.key("e", { ctrl: true });
    expect(screen.view()).toBe("explain");
    expect(screen.frame()).toContain("Clarified intent");
  });

  test("maps a risky quality status to its own label, never 'faithful'", async () => {
    const screen = await mountScreen({
      result: { kind: "success", text: "out", quality: { status: "risky", signals: [] } },
    });
    const frame = screen.frame();
    expect(frame).toContain(t("quality.statusRisky"));
    expect(frame).not.toContain("faithful");
  });

  test("scrolls a long result inside the transcript without breaking the editor", async () => {
    const longText = Array.from({ length: 40 }, (_, i) => `line ${String(i + 1)}`).join("\n");
    const screen = await mountScreen({
      result: { kind: "success", text: longText },
      height: 20,
    });
    const frame = screen.frame();
    expect(frame).toContain("line 1");
    // The footer is still intact: the transcript scrolled, not the UI.
    expect(frame).toContain("^G");
  });

  test("renders an error inside the transcript while the prompt stays visible", async () => {
    const screen = await mountScreen({
      result: { kind: "error", title: "API key missing", message: "configure the provider" },
    });
    await screen.type("my prompt");
    const frame = screen.frame();
    expect(frame).toContain("API key missing");
    expect(frame).toContain("my prompt");
    expect(screen.prompt()).toBe("my prompt");
  });
});

describe("EditorScreen · overlays", () => {
  test("opens the command palette on Ctrl+K and filters it as you type", async () => {
    const screen = await mountScreen();
    await screen.key("k", { ctrl: true });
    expect(screen.commands).toContain("open-palette");
    expect(screen.frame()).toContain(t("tui.palette.title"));

    await screen.type("res");
    const frame = screen.frame();
    // Only commands matching "res" remain (Reset).
    expect(frame).toContain(t("tui.command.reset"));
  });

  test("opens help on ? while the prompt is empty", async () => {
    const screen = await mountScreen();
    await screen.key("?");
    expect(screen.commands).toContain("open-help");
    expect(screen.frame()).toContain(t("tui.help"));
  });

  test("lists every profile option in the picker", async () => {
    const screen = await mountScreen();
    await screen.key("p", { ctrl: true });
    const frame = screen.frame();
    expect(frame).toContain(t("tui.changeProfile"));
    expect(frame).toContain("auto");
    // La recherche s'annonce : sans cette ligne, rien ne dit qu'on peut taper.
    expect(frame).toContain(t("tui.picker.searchHint"));
  });

  test("narrows the profile picker to what was typed", async () => {
    // Roadmap « passer à l'échelle des profils » : un catalogue qui grandit se
    // cherche. Le filtrage vit dans une fonction pure, mais c'est ici qu'on
    // vérifie qu'il atteint bien les lignes rendues.
    const screen = await mountScreen();
    await screen.key("p", { ctrl: true });
    screen.setOverlay({ active: "profile", index: 0, query: "writing" });
    await screen.settle();

    const frame = screen.frame();
    expect(frame).toContain("writing");
    expect(frame).toContain(t("tui.picker.search"));
    // `clean` est un profil intégré : il doit avoir disparu de la liste.
    expect(frame).not.toContain("clean");
  });

  test("says so instead of showing an empty picker", async () => {
    const screen = await mountScreen();
    await screen.key("p", { ctrl: true });
    screen.setOverlay({ active: "profile", index: 0, query: "zzzz-introuvable" });
    await screen.settle();

    expect(screen.frame()).toContain(t("tui.picker.noMatch"));
  });
});

describe("EditorScreen · height budget", () => {
  const heights = [40, 30, 24, 16] as const;

  test("keeps the editor border, status bar and all content within the terminal", async () => {
    for (const height of heights) {
      const screen = await mountScreen({ width: 120, height });
      const frame = screen.frame();

      // The editor's bottom border is drawn, so the surface did not overflow.
      // Matched on either corner glyph: the theme picks a rounded border only
      // when it detects a unicode-capable terminal, and the test renderer has
      // no TTY — asserting the rounded glyph tested the environment, not the
      // layout.
      expect(frame).toMatch(/[╰└]/);
      // The status bar is present and therefore inside the viewport.
      expect(frame).toContain("^G");

      // Nothing is rendered below the last terminal line: the frame has no
      // more rows than the terminal height.
      const rows = frame.split("\n").filter((line) => line.trim().length > 0).length;
      expect(rows).toBeLessThanOrEqual(height);
    }
  });
});
