import { describe, expect, it } from "vitest";
import { resolveShortcut, type ShortcutContext } from "../../src/ui/shortcuts.js";

const idle: ShortcutContext = { hasModal: false, hasResult: false, inputLength: 0 };
const withResult: ShortcutContext = { ...idle, hasResult: true };
const typing: ShortcutContext = { ...idle, inputLength: 4 };

const ctrl = { ctrl: true, escape: false };
const plain = { ctrl: false, escape: false };
const escapeKey = { ctrl: false, escape: true };

describe("resolveShortcut", () => {
  it.each([
    ["\r", "generate"],
    ["c", "exit"],
    ["d", "toggle-diff"],
    ["k", "open-commands"],
    ["l", "open-level"],
    ["m", "open-model"],
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

    it.each(["y", "d", "p", "r", "\r"])("swallows Ctrl+%s", (input) => {
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

    it("resolves from Ctrl+C", () => {
      expect(resolveShortcut("c", ctrl, idle)).toBe("exit");
    });
  });

  it("ignores ordinary typing", () => {
    expect(resolveShortcut("a", plain, typing)).toBeNull();
  });
});
