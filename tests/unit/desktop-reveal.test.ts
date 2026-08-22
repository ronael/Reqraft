import { describe, expect, it, vi } from "vitest";
import { revealExistingWindow, type RevealableWindow } from "@/apps/desktop/main/windows/reveal.js";

/**
 * Second-launch behaviour.
 *
 * The handler used to be empty, so relaunching Reqraft did nothing at all —
 * indistinguishable, for an application with no Dock icon, from one that
 * failed to start.
 */

function fakeWindow(state: Partial<Record<"destroyed" | "visible" | "minimised", boolean>> = {}) {
  const calls: string[] = [];
  const window: RevealableWindow = {
    isDestroyed: () => state.destroyed ?? false,
    isVisible: () => state.visible ?? false,
    isMinimized: () => state.minimised ?? false,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  };
  return { window, calls };
}

describe("revealExistingWindow", () => {
  it("brings a visible window forward instead of opening another one", () => {
    const visible = fakeWindow({ visible: true });
    const openFallback = vi.fn();

    expect(revealExistingWindow([visible.window], openFallback)).toBe("focused");
    expect(visible.calls).toEqual(["show", "focus"]);
    expect(openFallback).not.toHaveBeenCalled();
  });

  it("takes the first usable window, in the order given", () => {
    // Priority is the caller's: settings, then popover, then capsule. A window
    // the user can already see is what they are most likely asking for.
    const first = fakeWindow({ visible: true });
    const second = fakeWindow({ visible: true });

    revealExistingWindow([first.window, second.window], vi.fn());

    expect(first.calls).toEqual(["show", "focus"]);
    expect(second.calls).toEqual([]);
  });

  it("restores a minimised window before focusing it", () => {
    // Focusing a minimised window leaves it minimised: the user sees the Dock
    // bounce and no window.
    const minimised = fakeWindow({ minimised: true });

    revealExistingWindow([minimised.window], vi.fn());

    expect(minimised.calls).toEqual(["restore", "show", "focus"]);
  });

  it("ignores a hidden window rather than showing it", () => {
    // The capsule is hidden between triggers. Showing it here would put an
    // empty capture surface on screen that nobody asked for.
    const hidden = fakeWindow({ visible: false });
    const openFallback = vi.fn();

    expect(revealExistingWindow([hidden.window], openFallback)).toBe("opened");
    expect(hidden.calls).toEqual([]);
    expect(openFallback).toHaveBeenCalledOnce();
  });

  it("ignores a destroyed window", () => {
    const destroyed = fakeWindow({ destroyed: true, visible: true });
    const openFallback = vi.fn();

    expect(revealExistingWindow([destroyed.window], openFallback)).toBe("opened");
    expect(destroyed.calls).toEqual([]);
  });

  it("tolerates a window that was never created", () => {
    // The settings window is null until it is opened for the first time.
    const openFallback = vi.fn();

    expect(revealExistingWindow([null, undefined], openFallback)).toBe("opened");
    expect(openFallback).toHaveBeenCalledOnce();
  });

  it("opens the fallback exactly once when nothing is usable", () => {
    const openFallback = vi.fn();
    const hidden = fakeWindow();
    const destroyed = fakeWindow({ destroyed: true });

    revealExistingWindow([null, hidden.window, destroyed.window], openFallback);

    expect(openFallback).toHaveBeenCalledOnce();
  });

  it("never opens the fallback when a window was focused", () => {
    // The duplicate-window failure this exists to avoid.
    const openFallback = vi.fn();
    const visible = fakeWindow({ visible: true });

    revealExistingWindow([visible.window], openFallback);

    expect(openFallback).not.toHaveBeenCalled();
  });
});
