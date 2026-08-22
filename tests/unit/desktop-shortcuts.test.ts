import { describe, expect, it } from "vitest";
import {
  EXCLUDED_ACCELERATORS,
  SHORTCUT_CANDIDATES,
  isUsableAccelerator,
  prettyAccelerator,
  registerShortcuts,
  type ShortcutRegistrar,
} from "@/apps/desktop/main/shortcuts.js";
import { SHORTCUT_PRESETS } from "@/apps/desktop/shared/ipc-contract.js";

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
    const { register } = registrarTaking("Control+Alt+R", "Control+Shift+R");

    const resolution = registerShortcuts(register, handlers);

    expect(resolution.registered).toEqual([
      { accelerator: "Control+Alt+R", label: "⌃⌥R", intent: "capture" },
      { accelerator: "Control+Shift+R", label: "⌃⇧R", intent: "input" },
    ]);
    expect(resolution.rejected).toEqual([]);
  });

  it("un raccourci pris est visible et le suivant est essayé", () => {
    // Une autre application détient ⌃⌥R et ⌃⇧R : le booléen le dit, et la
    // liste continue plutôt que de laisser l'intention sans raccourci.
    const { register } = registrarTaking("Control+Alt+Command+R", "Control+Alt+Shift+R");

    const resolution = registerShortcuts(register, handlers);

    expect(resolution.rejected).toEqual(["Control+Alt+R", "Control+Shift+R"]);
    expect(resolution.registered.map((entry) => entry.accelerator)).toEqual([
      "Control+Alt+Command+R",
      "Control+Alt+Shift+R",
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

describe("raccourcis contestés et choix de l'utilisateur", () => {
  it("n'offre plus ⌥Espace ni ⌥⇧Espace par défaut", () => {
    // Ils s'enregistrent sans erreur, mais ChatGPT, Alfred et Raycast les
    // revendiquent : la dernière application lancée gagne, et un raccourci qui
    // dépend de l'ordre de démarrage n'est pas un défaut.
    const accelerators = SHORTCUT_CANDIDATES.map((candidate) => candidate.accelerator);
    expect(accelerators).not.toContain("Alt+Space");
    expect(accelerators).not.toContain("Alt+Shift+Space");
  });

  it("garde un défaut par intention", () => {
    const registrar = (): boolean => true;
    const resolution = registerShortcuts(registrar, {
      onCapture: () => undefined,
      onInput: () => undefined,
    });
    // Set rather than sorted list: what matters is that both intents are
    // covered, not the order the candidate list happened to produce.
    const intents = new Set(resolution.registered.map((entry) => entry.intent));
    expect(intents.has("capture")).toBe(true);
    expect(intents.has("input")).toBe(true);
  });

  it("aucun candidat n'est une combinaison exclue", () => {
    for (const candidate of SHORTCUT_CANDIDATES) {
      expect(EXCLUDED_ACCELERATORS).not.toContain(candidate.accelerator);
      expect(isUsableAccelerator(candidate.accelerator)).toBe(true);
    }
  });

  it("refuse une combinaison sans modificateur ou exclue", () => {
    // Une touche seule serait avalée partout sur le système.
    expect(isUsableAccelerator("R")).toBe(false);
    expect(isUsableAccelerator("")).toBe(false);
    expect(isUsableAccelerator("Command+Space")).toBe(false);
    expect(isUsableAccelerator("Alt+Space")).toBe(false);
    expect(isUsableAccelerator("Control+Alt+R")).toBe(true);
  });

  it("essaie d'abord le choix de l'utilisateur", () => {
    const tried: string[] = [];
    const resolution = registerShortcuts(
      (accelerator) => {
        tried.push(accelerator);
        return true;
      },
      { onCapture: () => undefined, onInput: () => undefined },
      undefined,
      { capture: "Command+Alt+K", input: "Command+Alt+Shift+K" },
    );

    expect(tried[0]).toBe("Command+Alt+K");
    expect(resolution.registered.find((e) => e.intent === "capture")?.accelerator).toBe(
      "Command+Alt+K",
    );
  });

  it("retombe sur la liste quand le choix de l'utilisateur est pris", () => {
    // Une application installée depuis peut avoir pris la combinaison : le
    // repli vaut mieux qu'un raccourci mort.
    const resolution = registerShortcuts(
      (accelerator) => accelerator !== "Command+Alt+K",
      { onCapture: () => undefined, onInput: () => undefined },
      undefined,
      { capture: "Command+Alt+K" },
    );

    expect(resolution.rejected).toContain("Command+Alt+K");
    expect(resolution.registered.find((e) => e.intent === "capture")?.accelerator).toBe(
      "Control+Alt+R",
    );
  });

  it("ignore un choix inutilisable au lieu de l'enregistrer", () => {
    const tried: string[] = [];
    registerShortcuts(
      (accelerator) => {
        tried.push(accelerator);
        return true;
      },
      { onCapture: () => undefined, onInput: () => undefined },
      undefined,
      { capture: "Alt+Space" },
    );

    expect(tried).not.toContain("Alt+Space");
  });

  it("les choix proposés dans les réglages sont tous utilisables", () => {
    for (const accelerator of [...SHORTCUT_PRESETS.capture, ...SHORTCUT_PRESETS.input]) {
      expect(isUsableAccelerator(accelerator)).toBe(true);
    }
  });
});
