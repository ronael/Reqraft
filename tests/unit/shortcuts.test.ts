import { describe, expect, it } from "vitest";
import {
  RESERVED_CTRL_KEYS,
  resolveShortcut,
  type ShortcutContext,
} from "../../src/ui/shortcuts.js";
import { getShortcutHints } from "../../src/ui/shortcut-hints.js";
import { resolveShortcutIntent } from "../../src/ui/shortcut-intents.js";

const idle: ShortcutContext = {
  hasModal: false,
  hasResult: false,
  inputLength: 0,
  isGenerating: false,
};
const withResult: ShortcutContext = { ...idle, hasResult: true };
const typing: ShortcutContext = { ...idle, inputLength: 4 };

const ctrl = { ctrl: true, escape: false };
const plain = { ctrl: false, escape: false };
const escapeKey = { ctrl: false, escape: true };

describe("resolveShortcut", () => {
  it.each([
    ["d", "toggle-diff"],
    ["o", "open-model"],
    ["k", "open-commands"],
    ["l", "open-level"],
    ["p", "open-profile"],
    ["r", "regenerate"],
    ["y", "copy"],
  ] as const)("maps Ctrl+%s to %s", (input, expected) => {
    expect(resolveShortcut(input, ctrl, idle)).toBe(expected);
  });

  it("ignores unbound control keys", () => {
    expect(resolveShortcut("z", ctrl, idle)).toBeNull();
  });

  describe("a modal captures every key but Escape", () => {
    const modal: ShortcutContext = { ...idle, hasModal: true };

    it("dismisses on Escape", () => {
      expect(resolveShortcut("", escapeKey, modal)).toBe("close-modal");
    });

    it.each(["y", "d", "p", "r"])("swallows Ctrl+%s", (input) => {
      expect(resolveShortcut(input, ctrl, modal)).toBeNull();
    });
  });

  describe("explain", () => {
    it("is available once a result exists", () => {
      expect(resolveShortcut("e", ctrl, withResult)).toBe("show-explain");
    });

    it("is inert without a result", () => {
      expect(resolveShortcut("e", ctrl, idle)).toBeNull();
    });
  });

  describe("help", () => {
    it("opens on ? when the prompt is empty", () => {
      expect(resolveShortcut("?", plain, idle)).toBe("open-help");
    });

    it("stays typable once the prompt has content", () => {
      expect(resolveShortcut("?", plain, typing)).toBeNull();
    });
  });

  describe("exit", () => {
    it("resolves from Escape outside a modal", () => {
      expect(resolveShortcut("", escapeKey, idle)).toBe("exit");
    });

    it("resolves from Ctrl+C when idle", () => {
      expect(resolveShortcut("c", ctrl, idle)).toBe("exit");
    });
  });

  describe("interrupt", () => {
    const generating: ShortcutContext = { ...idle, isGenerating: true };

    it("turns Ctrl+C into a cancellation while a run is in flight", () => {
      expect(resolveShortcut("c", ctrl, generating)).toBe("cancel");
    });

    it("still quits once the run is over", () => {
      expect(resolveShortcut("c", ctrl, idle)).toBe("exit");
    });
  });

  it("ignores ordinary typing", () => {
    expect(resolveShortcut("a", plain, typing)).toBeNull();
  });
});

describe("resolveShortcutIntent", () => {
  it("routes shortcut actions to typed app intentions", () => {
    expect(resolveShortcutIntent("close-modal")).toEqual({ type: "close-modal" });
    expect(resolveShortcutIntent("exit")).toEqual({ type: "exit" });
    expect(resolveShortcutIntent("cancel")).toEqual({ type: "cancel" });
    expect(resolveShortcutIntent("generate")).toEqual({
      type: "generate",
      preserveInput: false,
    });
    expect(resolveShortcutIntent("regenerate")).toEqual({
      type: "generate",
      preserveInput: true,
    });
    expect(resolveShortcutIntent("copy")).toEqual({
      type: "copy",
      preserveInput: true,
      dismissModal: false,
    });
    expect(resolveShortcutIntent("open-commands")).toEqual({
      type: "open-modal",
      modal: "commands",
      preserveInput: true,
    });
    expect(resolveShortcutIntent("show-explain")).toEqual({
      type: "show-view",
      view: "explain",
      preserveInput: true,
    });
  });
});

describe("keys the terminal cannot deliver", () => {
  const idleContext: ShortcutContext = {
    hasModal: false,
    hasResult: true,
    inputLength: 0,
    isGenerating: false,
  };

  it.each([...RESERVED_CTRL_KEYS])("never binds Ctrl+%s", (reserved) => {
    // Ink resolves these to Backspace, Tab, line feed and Enter before it
    // considers a control combination, so a binding here would be dead.
    expect(resolveShortcut(reserved, { ctrl: true, escape: false }, idleContext)).toBeNull();
  });

  it("advertises no shortcut on a reserved key", () => {
    const advertised = getShortcutHints({
      compact: false,
      hasResult: true,
      isGenerating: false,
    }).map((hint) => hint.keyLabel.replace("^", "").toLowerCase());

    for (const reserved of RESERVED_CTRL_KEYS) {
      expect(advertised).not.toContain(reserved);
    }
  });

  it("reaches the model picker through Ctrl+O instead of Ctrl+M", () => {
    expect(resolveShortcut("o", { ctrl: true, escape: false }, idleContext)).toBe("open-model");
    expect(
      getShortcutHints({ compact: false, hasResult: true, isGenerating: false }),
    ).toContainEqual({ keyLabel: "^O", action: "Modèle", disabled: false });
  });
});

describe("Ctrl+C is always reachable", () => {
  const base: ShortcutContext = {
    hasModal: false,
    hasResult: false,
    inputLength: 0,
    isGenerating: false,
  };

  it("quits from the main screen", () => {
    expect(resolveShortcut("c", { ctrl: true, escape: false }, base)).toBe("exit");
  });

  it("quits even with a modal open, so the user is never trapped", () => {
    expect(resolveShortcut("c", { ctrl: true, escape: false }, { ...base, hasModal: true })).toBe(
      "exit",
    );
  });

  it("interrupts a generation rather than quitting", () => {
    expect(
      resolveShortcut("c", { ctrl: true, escape: false }, { ...base, isGenerating: true }),
    ).toBe("cancel");
  });

  it("interrupts even from a modal", () => {
    expect(
      resolveShortcut(
        "c",
        { ctrl: true, escape: false },
        { ...base, hasModal: true, isGenerating: true },
      ),
    ).toBe("cancel");
  });
});

describe("control shortcuts never pollute the prompt", () => {
  /**
   * ink-text-input only filters arrows, Ctrl+C and Tab; every other control
   * combination has its letter inserted into the value. Ink dispatches the
   * field's handler before the app's, so the app has to pin the input back to
   * what it was before the keystroke. That makes `preserveInput` load-bearing
   * rather than cosmetic.
   */
  const CTRL_BOUND_KEYS = ["d", "e", "k", "l", "o", "p", "r", "y"] as const;

  it.each(CTRL_BOUND_KEYS)("restores the prompt after Ctrl+%s", (input) => {
    const action = resolveShortcut(
      input,
      { ctrl: true, escape: false },
      { hasModal: false, hasResult: true, inputLength: 12, isGenerating: false },
    );

    if (action === null) {
      throw new Error(`Ctrl+${input} resolved to no action`);
    }

    expect(resolveShortcutIntent(action)).toHaveProperty("preserveInput", true);
  });

  it("leaves quitting and interrupting outside that rule, since Ctrl+C is filtered upstream", () => {
    expect(resolveShortcutIntent("exit")).not.toHaveProperty("preserveInput");
    expect(resolveShortcutIntent("cancel")).not.toHaveProperty("preserveInput");
  });
});
