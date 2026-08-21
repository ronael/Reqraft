/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import React, { act, useCallback } from "react";
import { testRender } from "@opentui/react/test-utils";
import { registerRendererTeardown, trackRenderer } from "./harness.js";
import { KeyCodes } from "@opentui/core/testing";
import { OpenTuiApp, type TuiServices } from "@/apps/cli/tui/app/OpenTuiApp.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { ExecuteRepromptInput, ExecuteRepromptResult } from "@/application/reprompt.js";
import type { RepromptResult } from "@/core/types.js";
import { createTranslator } from "@/i18n/translate.js";

registerRendererTeardown();

const t = createTranslator("en");
const SHIFT_TAB = `${KeyCodes.ESCAPE}[Z`;

function makeResult(input: string): RepromptResult {
  return {
    original: input,
    rewritten: `REWRITTEN: ${input}`,
    profile: "auto",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: ["Clarified intent"],
    quality: { status: "good", signals: [] },
    latencyMs: 100,
  };
}

interface FakeOverrides {
  execute?: (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult>;
}

function fakeServices(overrides: FakeOverrides = {}): TuiServices {
  return {
    bootstrap: () => Promise.resolve({ config: { ...DEFAULT_CONFIG } }),
    // These flows never touch a profile; the profile suite drives the real
    // services against a temporary directory.
    profiles: {
      reload: () => Promise.resolve(),
      read: () => Promise.reject(new Error("not used")),
      create: () => Promise.reject(new Error("not used")),
      update: () => Promise.reject(new Error("not used")),
      remove: () => Promise.reject(new Error("not used")),
      exportToFile: () => Promise.reject(new Error("not used")),
      defaultProfile: () => Promise.resolve("auto"),
    },
    execute:
      overrides.execute ??
      ((input) => {
        input.onDelta?.(`streamed for ${input.input}`);
        return Promise.resolve({ result: makeResult(input.input), detectedProfile: false });
      }),
    readClipboard: () => Promise.resolve("pasted-content"),
    writeClipboard: () => Promise.resolve(),
    describeError: (error) => ({ title: "Generated error", message: String(error) }),
  };
}

/** A promise rejected when the run is cancelled, so the execute settles. */
function cancellableExecute(input: ExecuteRepromptInput): Promise<ExecuteRepromptResult> {
  return new Promise<ExecuteRepromptResult>((_resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    input.signal?.addEventListener("abort", () => {
      reject(new Error("aborted"));
    });
  });
}

async function mountApp(services: TuiServices) {
  const exitCalls: string[] = [];

  function Host(): React.ReactNode {
    const handleExit = useCallback(() => {
      exitCalls.push("exit");
    }, []);
    return <OpenTuiApp t={t} services={services} onExit={handleExit} />;
  }

  // The mount itself has to sit inside `act`: bootstrap resolves on the first
  // microtask after `testRender` returns, so its `setConfig`/`setApp` landed in
  // the gap before the first `settle()` and warned. `act` needs the environment
  // flag already set, which `testRender` normally does on the way in — so it is
  // armed here first.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let mounted!: Awaited<ReturnType<typeof testRender>>;
  await act(async () => {
    mounted = await testRender(<Host />, { width: 120, height: 40, exitOnCtrlC: false });
  });
  const setup = trackRenderer(mounted);

  // The first flush goes through `settle` like every other one: a bare
  // `flush()` lets the state updates it triggers escape React's batching, which
  // is what the "not wrapped in act" warning reports.
  const settle = async (): Promise<void> => {
    await act(async () => {
      // A macrotask, not just a flush: the app's bootstrap resolves on a later
      // tick and sets state from there, so draining only the render queue left
      // that update outside act.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await setup.flush();
    });
  };
  await settle();

  return {
    setup,
    frame: () => setup.captureCharFrame(),
    exitCalls,
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
    enter: async (): Promise<void> => {
      await act(async () => {
        setup.mockInput.pressEnter();
        await setup.flush();
      });
      await settle();
    },
    arrow: async (direction: "up" | "down"): Promise<void> => {
      await act(async () => {
        setup.mockInput.pressArrow(direction);
        await setup.flush();
      });
      await settle();
    },
    escape: async (): Promise<void> => {
      await act(async () => {
        await setup.mockInput.pressKeys([KeyCodes.ESCAPE], 30);
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
      await settle();
    },
  };
}

describe("OpenTuiApp · generation flow", () => {
  test("type -> Ctrl+G -> loading -> streaming -> success", async () => {
    const screen = await mountApp(fakeServices());
    await screen.type("hello");
    expect(screen.frame()).toContain("hello");

    await screen.key("g", { ctrl: true });
    await screen.settle();
    const frame = screen.frame();
    // The submitted prompt is the you turn and the result is rendered.
    expect(frame).toContain("REWRITTEN: hello");
    expect(frame).toContain(t("tui.turn.you"));
  });

  test("Ctrl+C asks the host to quit when nothing is running", async () => {
    // The half of the quit path that can regress without anyone noticing:
    // `onExit` was wired all along, but the host was calling `stop()`, which
    // only halts the render loop and leaves the terminal captured. Assert the
    // routing here; the host's teardown is one line at the entry point.
    const screen = await mountApp(fakeServices());
    expect(screen.exitCalls).toEqual([]);

    await screen.key("c", { ctrl: true });
    await screen.settle();

    expect(screen.exitCalls).toEqual(["exit"]);
  });

  test("Ctrl+C interrupts a running generation instead of quitting", async () => {
    // A generation that never settles, so the interrupt lands mid-run.
    const screen = await mountApp(
      fakeServices({ execute: () => new Promise<never>(() => undefined) }),
    );
    await screen.type("hello");
    await screen.key("g", { ctrl: true });
    await screen.settle();

    await screen.key("c", { ctrl: true });
    await screen.settle();

    // Quitting mid-run would lose the generation; the same chord cancels.
    expect(screen.exitCalls).toEqual([]);
  });

  test("Ctrl+Y copies and shows a transient toast", async () => {
    const screen = await mountApp(fakeServices());
    await screen.type("hello");
    await screen.key("g", { ctrl: true });
    await screen.settle();

    await screen.key("y", { ctrl: true });
    expect(screen.frame()).toContain(t("tui.toast.copied"));
  });

  test("Ctrl+R resets the session and clears the transcript", async () => {
    const screen = await mountApp(fakeServices());
    await screen.type("hello");
    await screen.key("g", { ctrl: true });
    await screen.settle();
    expect(screen.frame()).toContain("REWRITTEN: hello");

    await screen.key("r", { ctrl: true });
    const frame = screen.frame();
    expect(frame).not.toContain("REWRITTEN: hello");
    expect(frame).toContain(t("tui.toast.reset"));
  });
});

describe("OpenTuiApp · palette to picker", () => {
  test("selecting Profile from the palette opens the picker instead of closing it", async () => {
    const screen = await mountApp(fakeServices());

    await screen.key("k", { ctrl: true });
    expect(screen.frame()).toContain(t("tui.palette.title"));

    await screen.type("pro");
    await screen.enter();

    // The palette closes (its query line is gone) and the Profile picker opens.
    expect(screen.frame()).not.toContain("> pro");
    expect(screen.frame()).toContain(t("tui.changeProfile"));

    // Escape restores focus.
    await screen.escape();
    expect(screen.frame()).not.toContain(t("tui.changeProfile"));
    await screen.type("x");
    expect(screen.frame()).toContain("x");
  });
});

describe("OpenTuiApp · cancellation", () => {
  test("Ctrl+C during a run cancels with a single toast", async () => {
    const screen = await mountApp(
      fakeServices({
        execute: (input) => {
          input.onDelta?.("streaming…");
          return cancellableExecute(input);
        },
      }),
    );

    await screen.type("hello");
    await screen.key("g", { ctrl: true });
    await screen.settle();
    expect(screen.frame()).toContain("streaming");

    await screen.key("c", { ctrl: true });
    await screen.settle();
    expect(screen.frame()).toContain(t("tui.toast.cancelled"));
  });
});

describe("OpenTuiApp · error precedence", () => {
  test("a failing second run shows the error, not the previous success", async () => {
    let calls = 0;
    const screen = await mountApp(
      fakeServices({
        execute: (input) => {
          calls += 1;
          if (calls > 1) return Promise.reject(new Error("boom on second run"));
          return Promise.resolve({ result: makeResult(input.input), detectedProfile: false });
        },
      }),
    );

    await screen.type("first");
    await screen.key("g", { ctrl: true });
    await screen.settle();
    expect(screen.frame()).toContain("REWRITTEN: first");

    // Second run fails.
    await screen.type("second");
    await screen.key("g", { ctrl: true });
    await screen.settle();
    const frame = screen.frame();
    expect(frame).toContain("Generated error");
    expect(frame).not.toContain("REWRITTEN: first");
  });
});

describe("OpenTuiApp · prompt snapshot", () => {
  test("editing the editor after a run does not rewrite the you turn", async () => {
    const screen = await mountApp(fakeServices());
    await screen.type("prompt A");
    await screen.key("g", { ctrl: true });
    await screen.settle();
    expect(screen.frame()).toContain("REWRITTEN: prompt A");

    // The editor holds B, but the you turn keeps the submitted A.
    await screen.type("prompt B");
    const frame = screen.frame();
    expect(frame).toContain("prompt A");
    // The result still belongs to the old prompt.
    expect(frame).toContain("REWRITTEN: prompt A");
  });
});

describe("OpenTuiApp · focus ring", () => {
  test("Tab and Shift+Tab walk the ring without typing", async () => {
    const screen = await mountApp(fakeServices());
    await screen.type("hello");
    await screen.key("g", { ctrl: true });
    await screen.settle();

    await screen.key("TAB");
    await screen.key(SHIFT_TAB);
    expect(screen.frame()).toContain("REWRITTEN: hello");
  });
});
