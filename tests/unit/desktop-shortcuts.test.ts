import { describe, expect, it } from "vitest";
import {
  prettyAccelerator,
  registerShortcuts,
  SHORTCUT_CANDIDATES,
  type ShortcutRegistrar,
} from "@/desktop/main/shortcuts.js";

function registrarTaking(...accepted: string[]): {
  register: ShortcutRegistrar;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    register: (accelerator) => {
      calls.push(accelerator);
      return accepted.includes(accelerator);
    },
  };
}

const handlers = { onCapture: () => undefined, onInput: () => undefined };

describe("registerShortcuts (DESKTOP.md §5.5)", () => {
  it("enregistre un raccourci par intention, dans l'ordre des candidats", () => {
    const { register } = registrarTaking("Alt+Space", "Alt+Shift+Space");

    const resolution = registerShortcuts(register, handlers);

    expect(resolution.registered).toEqual([
      { accelerator: "Alt+Space", label: "⌥Espace", intent: "capture" },
      { accelerator: "Alt+Shift+Space", label: "⌥⇧Espace", intent: "input" },
    ]);
    expect(resolution.rejected).toEqual([]);
  });

  it("un raccourci pris est visible et le suivant est essayé", () => {
    // Alfred/Raycast détiennent ⌥Espace et ⌥⇧Espace : le booléen le dit.
    const { register } = registrarTaking("Control+Alt+R", "Control+Shift+R");

    const resolution = registerShortcuts(register, handlers);

    expect(resolution.rejected).toEqual(["Alt+Space", "Alt+Shift+Space"]);
    expect(resolution.registered.map((entry) => entry.accelerator)).toEqual([
      "Control+Alt+R",
      "Control+Shift+R",
    ]);
  });

  it("aucun candidat disponible : échec explicite, jamais silencieux", () => {
    const { register } = registrarTaking();

    const resolution = registerShortcuts(register, handlers);

    expect(resolution.registered).toEqual([]);
    expect(resolution.rejected.length).toBeGreaterThan(0);
  });

  it("un choix forcé qui échoue n'est pas contourné en douce", () => {
    const { register, calls } = registrarTaking();

    const resolution = registerShortcuts(register, handlers, "F13");

    expect(calls).toEqual(["F13"]);
    expect(resolution.registered).toEqual([]);
    expect(resolution.rejected).toEqual(["F13"]);
  });

  it("⌘Espace et ⌃Espace sont exclus : macOS les avale en mentant sur le booléen", () => {
    const accelerators = SHORTCUT_CANDIDATES.map((candidate) => candidate.accelerator);
    expect(accelerators).not.toContain("Command+Space");
    expect(accelerators).not.toContain("Control+Space");
  });
});

describe("prettyAccelerator", () => {
  it("produit les symboles macOS", () => {
    expect(prettyAccelerator("Control+Alt+R")).toBe("⌃⌥R");
    expect(prettyAccelerator("Command+Shift+Space")).toBe("⌘⇧Espace");
  });
});
