import { describe, expect, it } from "vitest";
import { formatAccelerator } from "@/apps/desktop/renderer/settings/SettingsApp.js";
import { SHORTCUT_PRESETS } from "@/apps/desktop/shared/ipc-contract.js";
import { prettyAccelerator } from "@/apps/desktop/main/shortcuts.js";

/**
 * How a shortcut is written in the settings.
 *
 * The symbols alone were the problem: `⌘⌃⌥N` is four glyphs, three of them
 * alike at 11px, and `⌃` renders as a bare caret in most interface fonts — so
 * the window showed `⌘^⌥N` and nobody could tell which keys to press.
 */

describe("formatAccelerator", () => {
  it("spells every modifier out", () => {
    expect(formatAccelerator("Command+Control+R")).toBe("Cmd + Ctrl + R");
    expect(formatAccelerator("Command+Control+Alt+N")).toBe("Cmd + Ctrl + Option + N");
    expect(formatAccelerator("Control+Shift+G")).toBe("Ctrl + Maj + G");
  });

  it("names the space bar rather than leaving it invisible", () => {
    expect(formatAccelerator("Alt+Shift+Space")).toBe("Option + Maj + Espace");
  });

  it("shows a dash when no shortcut is in force", () => {
    // Registration can fail for every candidate; the row must say so rather
    // than render an empty box.
    expect(formatAccelerator("")).toBe("—");
  });

  it("leaves an unknown accelerator readable instead of dropping it", () => {
    // A value stored before the offered list changed still has to be shown.
    expect(formatAccelerator("Command+Alt+K")).toBe("Cmd + Option + K");
  });

  it("writes every offered preset without leaving a raw token", () => {
    for (const accelerator of [...SHORTCUT_PRESETS.capture, ...SHORTCUT_PRESETS.input]) {
      const label = formatAccelerator(accelerator);
      expect(label).not.toContain("Command");
      expect(label).not.toContain("Control");
      expect(label).not.toContain("+Alt");
    }
  });
});

describe("les deux formateurs ne servent plus à comparer", () => {
  it("produisent des sorties différentes, ce qui rendait la comparaison fausse", () => {
    // The row used to test `prettyLabel(chosen) !== active`, where `active` came
    // from the main process. Two formatters, one comparison: a shortcut that
    // worked was reported as unavailable. The row now compares raw against raw,
    // and this asserts why it had to.
    const accelerator = "Command+Control+R";
    expect(prettyAccelerator(accelerator)).not.toBe(formatAccelerator(accelerator));
  });
});
