import { describe, expect, it } from "vitest";
import {
  INITIAL_OVERLAY,
  clampSelection,
  closeOverlay,
  hasOverlay,
  isActive,
  isListOverlay,
  moveSelection,
  openOverlay,
} from "@/apps/cli/tui/model/overlay.js";
import { routeKey, type RoutingContext } from "@/apps/cli/tui/model/keymap.js";

const IDLE: RoutingContext = {
  hasOverlay: false,
  hasResult: false,
  isGenerating: false,
  inputLength: 0,
  editorFocused: true,
};

describe("overlay model", () => {
  it("starts closed with no highlight and an empty query", () => {
    expect(INITIAL_OVERLAY).toEqual({ active: null, index: 0, query: "" });
    expect(hasOverlay(INITIAL_OVERLAY)).toBe(false);
  });

  it("opens an overlay, resetting the selection", () => {
    const opened = openOverlay(INITIAL_OVERLAY, "profile");
    expect(isActive(opened, "profile")).toBe(true);
    expect(hasOverlay(opened)).toBe(true);
    expect(opened.index).toBe(0);
  });

  it("closes an overlay", () => {
    const closed = closeOverlay(openOverlay(INITIAL_OVERLAY, "model"));
    expect(hasOverlay(closed)).toBe(false);
    expect(closed.active).toBeNull();
  });

  it("moves the selection within bounds and wraps", () => {
    const opened = openOverlay(INITIAL_OVERLAY, "level");
    expect(moveSelection(opened, 1, 3).index).toBe(1);
    expect(moveSelection(opened, -1, 3).index).toBe(2);
    // A list with no rows cannot move anywhere.
    expect(moveSelection(opened, 1, 0).index).toBe(0);
  });

  it("clamps the selection when the list shrinks", () => {
    const opened = { ...openOverlay(INITIAL_OVERLAY, "palette"), index: 5 };
    expect(clampSelection(opened, 2).index).toBe(1);
    expect(clampSelection(opened, 0).index).toBe(0);
  });

  it("treats the four pickers as list overlays, not palette or help", () => {
    for (const id of ["profile", "level", "provider", "model"] as const) {
      expect(isListOverlay(id)).toBe(true);
    }
    expect(isListOverlay("palette")).toBe(false);
    expect(isListOverlay("help")).toBe(false);
  });
});

describe("overlay keyboard routing", () => {
  it("routes arrow keys to overlay navigation while an overlay is open", () => {
    const context = { ...IDLE, hasOverlay: true };
    expect(routeKey({ ctrl: false, name: "up" }, context)).toEqual({
      kind: "overlay-nav",
      dir: -1,
    });
    expect(routeKey({ ctrl: false, name: "down" }, context)).toEqual({
      kind: "overlay-nav",
      dir: 1,
    });
  });

  it("routes return and backspace to overlay actions", () => {
    const context = { ...IDLE, hasOverlay: true };
    expect(routeKey({ ctrl: false, name: "return" }, context)).toEqual({ kind: "overlay-select" });
    expect(routeKey({ ctrl: false, name: "backspace" }, context)).toEqual({
      kind: "overlay-backspace",
    });
  });

  it("still closes an overlay on escape", () => {
    expect(routeKey({ ctrl: false, name: "escape" }, { ...IDLE, hasOverlay: true })).toEqual({
      kind: "command",
      id: "close-overlay",
    });
  });
});
