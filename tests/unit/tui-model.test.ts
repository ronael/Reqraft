import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  COMMANDS_BY_ID,
  availableCommands,
  commandKeyLabel,
  formatChord,
  reservedChords,
  type CommandContext,
} from "@/apps/cli/tui/model/commands.js";
import {
  FOCUS_RING,
  INITIAL_FOCUS,
  focus,
  focusNext,
  focusPrevious,
  isSuspended,
  restoreFocus,
  suspendFocus,
} from "@/apps/cli/tui/model/focus.js";
import { routeKey, type RoutingContext } from "@/apps/cli/tui/model/keymap.js";
import { resolveLayout, resolveLayoutMode } from "@/apps/cli/tui/model/layout.js";
import { isBusy, partialText } from "@/apps/cli/tui/model/result-state.js";

const IDLE: CommandContext = {
  hasOverlay: false,
  hasResult: false,
  isGenerating: false,
  inputLength: 0,
};

function routing(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return { ...IDLE, editorFocused: true, ...overrides };
}

describe("command registry", () => {
  it("never binds a control key the terminal cannot deliver", () => {
    // Ctrl+H/I/J/M arrive as Backspace/Tab/LF/Enter, so binding one is a
    // silent no-op — worse than not offering the shortcut at all.
    expect(reservedChords()).toEqual([]);
  });

  it("derives the displayed key from the binding, so a footer cannot drift", () => {
    const generate = COMMANDS_BY_ID.get("generate");
    if (generate === undefined) throw new Error("generate command missing from the registry");

    expect(commandKeyLabel(generate)).toBe("^G");
    expect(formatChord({ ctrl: false, name: "escape" })).toBe("esc");
    expect(formatChord({ ctrl: false, name: "tab" })).toBe("Tab");
  });

  it("gives every command a translatable label rather than a hardcoded one", () => {
    for (const command of COMMANDS) {
      expect(command.labelKey).toMatch(/^tui\.command\./);
    }
  });

  it("hides result-only commands until a result exists", () => {
    const ids = availableCommands(IDLE).map((command) => command.id);
    expect(ids).not.toContain("copy");
    expect(ids).not.toContain("toggle-diff");

    const withResult = availableCommands({ ...IDLE, hasResult: true }).map((c) => c.id);
    expect(withResult).toContain("copy");
    expect(withResult).toContain("toggle-diff");
  });

  it("offers generate only once the prompt has content", () => {
    expect(availableCommands(IDLE).map((c) => c.id)).not.toContain("generate");
    expect(availableCommands({ ...IDLE, inputLength: 3 }).map((c) => c.id)).toContain("generate");
  });
});

describe("keyboard routing", () => {
  it("turns a global chord into a command instead of text, even in the editor", () => {
    const route = routeKey({ ctrl: true, name: "g" }, routing({ inputLength: 5 }));
    expect(route).toEqual({ kind: "command", id: "generate" });
  });

  it("keeps ordinary typing as input", () => {
    expect(routeKey({ ctrl: false, name: "a" }, routing())).toEqual({ kind: "insert" });
  });

  it("never lets an overlay leak keys into the editor", () => {
    const context = routing({ hasOverlay: true });
    expect(routeKey({ ctrl: false, name: "a" }, context)).toEqual({ kind: "ignored" });
    expect(routeKey({ ctrl: true, name: "p" }, context)).toEqual({ kind: "ignored" });
  });

  it("closes the overlay on escape rather than quitting", () => {
    const route = routeKey({ ctrl: false, name: "escape" }, routing({ hasOverlay: true }));
    expect(route).toEqual({ kind: "command", id: "close-overlay" });
  });

  it("keeps ctrl+c reachable from every layer", () => {
    expect(routeKey({ ctrl: true, name: "c" }, routing({ hasOverlay: true }))).toEqual({
      kind: "command",
      id: "exit",
    });
    expect(routeKey({ ctrl: true, name: "c" }, routing({ isGenerating: true }))).toEqual({
      kind: "command",
      id: "cancel",
    });
  });

  it("opens help on ? only while the prompt is empty, so ? stays typable", () => {
    expect(routeKey({ ctrl: false, name: "?" }, routing())).toEqual({
      kind: "command",
      id: "open-help",
    });
    expect(routeKey({ ctrl: false, name: "?" }, routing({ inputLength: 4 }))).toEqual({
      kind: "insert",
    });
  });

  it("does not fire an unavailable command, and does not type it either", () => {
    // Ctrl+Y is copy, which needs a result. Without one it must do nothing —
    // and must certainly not reach the editor as text.
    expect(routeKey({ ctrl: true, name: "y" }, routing())).toEqual({ kind: "insert" });
  });
});

describe("focus model", () => {
  const withResult = { hasResult: true };
  const withoutResult = { hasResult: false };

  it("starts on the editor", () => {
    expect(INITIAL_FOCUS.zone).toBe("editor");
    expect(isSuspended(INITIAL_FOCUS)).toBe(false);
  });

  it("cycles the ring forward and backward", () => {
    const next = focusNext(INITIAL_FOCUS, withResult);
    expect(next.zone).toBe("result");
    expect(focusNext(next, withResult).zone).toBe("toolbar");
    expect(focusPrevious(next, withResult).zone).toBe("editor");
  });

  it("wraps around the ring", () => {
    const last = focus(INITIAL_FOCUS, "toolbar", withResult);
    expect(focusNext(last, withResult).zone).toBe("editor");
    expect(focusPrevious(INITIAL_FOCUS, withResult).zone).toBe("toolbar");
  });

  it("skips a result panel that does not exist yet", () => {
    expect(focusNext(INITIAL_FOCUS, withoutResult).zone).toBe("toolbar");
    expect(focus(INITIAL_FOCUS, "result", withoutResult).zone).toBe("editor");
  });

  it("freezes the ring while an overlay is open", () => {
    const suspended = suspendFocus(INITIAL_FOCUS);
    expect(focusNext(suspended, withResult)).toEqual(suspended);
  });

  it("restores the zone focus came from when the overlay closes", () => {
    const onResult = focus(INITIAL_FOCUS, "result", withResult);
    const opened = suspendFocus(onResult);
    expect(isSuspended(opened)).toBe(true);
    expect(restoreFocus(opened)).toEqual({ zone: "result", suspended: null });
  });

  it("keeps the original anchor when a second overlay opens", () => {
    const opened = suspendFocus(focus(INITIAL_FOCUS, "result", withResult));
    expect(suspendFocus(opened)).toEqual(opened);
  });

  it("covers every zone of the ring", () => {
    expect(FOCUS_RING).toEqual(["editor", "result", "toolbar"]);
  });
});

describe("responsive layout", () => {
  it("splits columns only when the terminal is genuinely wide", () => {
    expect(resolveLayout(120, 40).mode).toBe("wide");
    expect(resolveLayout(120, 40).splitColumns).toBe(true);
    expect(resolveLayout(100, 30).splitColumns).toBe(false);
  });

  it("drops metadata before anything structural on a short terminal", () => {
    const compact = resolveLayout(100, 24);
    expect(compact.mode).toBe("compact");
    expect(compact.showMetadata).toBe(false);
    expect(compact.showStatusBar).toBe(true);
  });

  it("classifies the reference terminal sizes", () => {
    expect(resolveLayoutMode(120, 40)).toBe("wide");
    expect(resolveLayoutMode(100, 30)).toBe("normal");
    expect(resolveLayoutMode(80, 24)).toBe("compact");
    expect(resolveLayoutMode(60, 16)).toBe("compact");
    expect(resolveLayoutMode(40, 10)).toBe("too-small");
  });

  it("always leaves the editor at least one row, however small the terminal", () => {
    for (const [width, height] of [
      [120, 40],
      [100, 30],
      [80, 24],
      [60, 16],
      [20, 4],
      [1, 1],
    ] as const) {
      const layout = resolveLayout(width, height);
      expect(layout.editorRows).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(layout.editorRows)).toBe(true);
    }
  });

  it("stops rendering optional rows below the minimum rather than overflowing", () => {
    const tiny = resolveLayout(30, 8);
    expect(tiny.mode).toBe("too-small");
    expect(tiny.showStatusBar).toBe(false);
    expect(tiny.splitColumns).toBe(false);
  });
});

describe("result state", () => {
  it("keeps partial text when a stream is interrupted", () => {
    expect(partialText({ kind: "streaming", partial: "half" })).toBe("half");
    expect(partialText({ kind: "streaming", partial: "" })).toBeNull();
    expect(partialText({ kind: "empty" })).toBeNull();
  });

  it("treats loading and streaming as busy, nothing else", () => {
    expect(isBusy({ kind: "loading" })).toBe(true);
    expect(isBusy({ kind: "streaming", partial: "" })).toBe(true);
    expect(isBusy({ kind: "empty" })).toBe(false);
    expect(isBusy({ kind: "error", title: "t", message: "m" })).toBe(false);
  });
});
