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

const handlers = {
  onCapture: () => undefined,
  onInput: () => undefined,
  onPopover: () => undefined,
};

describe("registerShortcuts (DESKTOP.md §5.5)", () => {
  it("enregistre un raccourci par intention, dans l'ordre des candidats", () => {
    const { register } = registrarTaking(
      "Command+Control+R",
      "Command+Control+N",
      "Command+Control+O",
    );

    const resolution = registerShortcuts(register, handlers);

    expect(resolution.registered).toEqual([
      { accelerator: "Command+Control+R", label: "⌘⌃R", intent: "capture" },
      { accelerator: "Command+Control+N", label: "⌘⌃N", intent: "input" },
      { accelerator: "Command+Control+O", label: "⌘⌃O", intent: "popover" },
    ]);
    expect(resolution.rejected).toEqual([]);
    expect(resolution.conflicts).toEqual([]);
  });

  it("un raccourci pris est visible et le suivant est essayé", () => {
    // Une autre application détient ⌃⌥R et ⌃⇧R : le booléen le dit, et la
    // liste continue plutôt que de laisser l'intention sans raccourci.
    const { register } = registrarTaking(
      "Command+Control+J",
      "Command+Control+K",
      "Command+Control+T",
    );

    const resolution = registerShortcuts(register, handlers);

    expect(resolution.rejected).toEqual([
      "Command+Control+R",
      "Command+Control+N",
      "Command+Control+O",
    ]);
    expect(resolution.registered.map((entry) => entry.accelerator)).toEqual([
      "Command+Control+J",
      "Command+Control+K",
      "Command+Control+T",
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
    expect(prettyAccelerator("Command+Shift+Space")).toBe("⌘⇧Space");
  });
});

describe("raccourcis contestés et choix de l'utilisateur", () => {
  it("évite les familles que navigateurs et IDE revendiquent", () => {
    // Un raccourci global prend la frappe à l'application au premier plan :
    // ⌃⇧R est le rechargement forcé des navigateurs sous Windows et Linux, et
    // ⌃⌥R est lié dans plusieurs keymaps d'IDE.
    const accelerators = SHORTCUT_CANDIDATES.map((candidate) => candidate.accelerator);
    expect(accelerators).not.toContain("Control+Shift+R");
    expect(accelerators).not.toContain("Control+Alt+R");
    // ⌘⌃ est la seule famille à deux modificateurs que les applications ne
    // lient presque jamais.
    for (const accelerator of accelerators) {
      expect(accelerator.startsWith("Command+Control+")).toBe(true);
    }
  });

  it("n'utilise pas les lettres que macOS réserve déjà sur ⌘⌃", () => {
    // ⌘⌃F plein écran, ⌘⌃Q verrouillage, ⌘⌃D dictionnaire, ⌘⌃Espace émojis.
    for (const reserved of [
      "Command+Control+F",
      "Command+Control+Q",
      "Command+Control+D",
      "Command+Control+Space",
    ]) {
      expect(EXCLUDED_ACCELERATORS).toContain(reserved);
      expect(isUsableAccelerator(reserved)).toBe(false);
    }
  });

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
      onPopover: () => undefined,
    });
    // Set rather than sorted list: what matters is that all intents are
    // covered, not the order the candidate list happened to produce.
    const intents = new Set(resolution.registered.map((entry) => entry.intent));
    expect(intents.has("capture")).toBe(true);
    expect(intents.has("input")).toBe(true);
    expect(intents.has("popover")).toBe(true);
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
      handlers,
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
      handlers,
      undefined,
      { capture: "Command+Alt+K" },
    );

    expect(resolution.rejected).toContain("Command+Alt+K");
    expect(resolution.registered.find((e) => e.intent === "capture")?.accelerator).toBe(
      "Command+Control+R",
    );
  });

  it("ne retente pas un choix préféré identique au premier défaut", () => {
    const tried: string[] = [];
    const resolution = registerShortcuts(
      (accelerator) => {
        tried.push(accelerator);
        return accelerator !== "Command+Control+R";
      },
      handlers,
      undefined,
      { capture: "Command+Control+R" },
    );

    expect(tried.filter((accelerator) => accelerator === "Command+Control+R")).toHaveLength(1);
    expect(resolution.rejected).toEqual(["Command+Control+R"]);
    expect(resolution.registered.find((entry) => entry.intent === "capture")?.accelerator).toBe(
      "Command+Control+J",
    );
  });

  it("ignore un choix inutilisable au lieu de l'enregistrer", () => {
    const tried: string[] = [];
    registerShortcuts(
      (accelerator) => {
        tried.push(accelerator);
        return true;
      },
      handlers,
      undefined,
      { capture: "Alt+Space" },
    );

    expect(tried).not.toContain("Alt+Space");
  });

  it("les choix proposés dans les réglages sont tous utilisables", () => {
    for (const accelerator of [
      ...SHORTCUT_PRESETS.capture,
      ...SHORTCUT_PRESETS.input,
      ...SHORTCUT_PRESETS.popover,
    ]) {
      expect(isUsableAccelerator(accelerator)).toBe(true);
    }
  });

  it("refuse un doublon interne sans remplacer le premier handler", () => {
    const calls: string[] = [];
    const resolution = registerShortcuts(
      (accelerator) => {
        calls.push(accelerator);
        return true;
      },
      handlers,
      undefined,
      {
        capture: "Command+Alt+K",
        input: "Command+Alt+K",
        popover: "Command+Alt+P",
      },
    );

    expect(calls.filter((accelerator) => accelerator === "Command+Alt+K")).toHaveLength(1);
    expect(resolution.conflicts).toEqual(["Command+Alt+K"]);
    expect(resolution.registered.find((entry) => entry.intent === "capture")?.accelerator).toBe(
      "Command+Alt+K",
    );
    expect(resolution.registered.find((entry) => entry.intent === "input")?.accelerator).toBe(
      "Command+Control+N",
    );
  });
});
