import { describe, expect, it } from "vitest";
import { formatAccelerator } from "@/apps/desktop/renderer/shared/shortcut-labels.js";
import { createDesktopTranslator } from "@/i18n/desktop/index.js";
import { SHORTCUT_PRESETS } from "@/apps/desktop/shared/ipc-contract.js";
import { prettyAccelerator } from "@/apps/desktop/main/shortcuts.js";

/**
 * How a shortcut is written in the settings.
 *
 * The symbols alone were the problem: `⌘⌃⌥N` is four glyphs, three of them
 * alike at 11px, and `⌃` renders as a bare caret in most interface fonts — so
 * the window showed `⌘^⌥N` and nobody could tell which keys to press.
 */

const t = createDesktopTranslator("fr");

describe("formatAccelerator", () => {
  it("spells every modifier out", () => {
    expect(formatAccelerator("Command+Control+R", t)).toBe("Cmd + Ctrl + R");
    expect(formatAccelerator("Command+Control+Alt+N", t)).toBe("Cmd + Ctrl + Option + N");
    expect(formatAccelerator("Control+Shift+G", t)).toBe("Ctrl + Maj + G");
  });

  it("names the space bar rather than leaving it invisible", () => {
    expect(formatAccelerator("Alt+Shift+Space", t)).toBe("Option + Maj + Espace");
  });

  it("shows a dash when no shortcut is in force", () => {
    // Registration can fail for every candidate; the row must say so rather
    // than render an empty box.
    expect(formatAccelerator("", t)).toBe("—");
  });

  it("leaves an unknown accelerator readable instead of dropping it", () => {
    // A value stored before the offered list changed still has to be shown.
    expect(formatAccelerator("Command+Alt+K", t)).toBe("Cmd + Option + K");
  });

  it("writes every offered preset without leaving a raw token", () => {
    for (const accelerator of [
      ...SHORTCUT_PRESETS.capture,
      ...SHORTCUT_PRESETS.input,
      ...SHORTCUT_PRESETS.popover,
    ]) {
      const label = formatAccelerator(accelerator, t);
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
    expect(prettyAccelerator(accelerator)).not.toBe(formatAccelerator(accelerator, t));
  });
});

describe("plus de combinaisons à quatre touches", () => {
  it("n'offre aucun raccourci avec Option", () => {
    // Cmd+Ctrl+Option+N demande quatre doigts, et c'est celui qui gagnait
    // systématiquement comme repli.
    for (const accelerator of [
      ...SHORTCUT_PRESETS.capture,
      ...SHORTCUT_PRESETS.input,
      ...SHORTCUT_PRESETS.popover,
    ]) {
      expect(accelerator, `${accelerator} contient Option`).not.toContain("Alt");
    }
  });

  it("garde des combinaisons distinctes entre les trois intentions", () => {
    // Deux intentions ne peuvent pas partager une touche : la seconde
    // enregistrée gagnerait sans que rien ne le dise.
    const all = [
      ...SHORTCUT_PRESETS.capture,
      ...SHORTCUT_PRESETS.input,
      ...SHORTCUT_PRESETS.popover,
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});
