import { describe, expect, it } from "vitest";
import {
  BASE_LAYER_PRIORITY,
  MODAL_LAYER_PRIORITY,
  RESERVED_CTRL_KEYS,
  createBaseBindings,
  createModalBindings,
  type KeymapActions,
  type KeymapConditions,
} from "../../src/ui/interaction/keys.js";

function makeConditions(overrides?: Partial<Record<string, boolean>>): KeymapConditions {
  const values = { modalOpen: false, hasResult: false, inputEmpty: true, ...overrides };
  return {
    modalOpen: () => values.modalOpen,
    hasResult: () => values.hasResult,
    inputEmpty: () => values.inputEmpty,
  };
}

function makeActions(): KeymapActions {
  const noop = (): void => undefined;
  return {
    interruptOrExit: noop,
    exit: noop,
    moveFocus: noop,
    generate: noop,
    openProfile: noop,
    openLevel: noop,
    openProvider: noop,
    openModel: noop,
    toggleDiff: noop,
    showExplain: noop,
    copyResult: noop,
    reset: noop,
    openHelp: noop,
    pasteFromClipboard: noop,
    closeModal: noop,
  };
}

function enabled(binding: { enabled?: () => boolean }, conditions: KeymapConditions): boolean {
  return binding.enabled ? binding.enabled() : true;
}

describe("base keymap bindings", () => {
  it("never reserves terminal control keys that collapse to editing keys", () => {
    expect([...RESERVED_CTRL_KEYS].sort()).toEqual(["h", "i", "j", "m"]);
  });

  it("maps the global shortcuts", () => {
    const bindings = createBaseBindings(makeActions(), makeConditions());
    const byKey = new Map(bindings.map((binding) => [binding.key, binding]));
    expect(byKey.get("ctrl+g")).toBeDefined();
    expect(byKey.get("ctrl+p")).toBeDefined();
    expect(byKey.get("ctrl+l")).toBeDefined();
    expect(byKey.get("ctrl+i")).toBeDefined();
    expect(byKey.get("ctrl+o")).toBeDefined();
    expect(byKey.get("ctrl+d")).toBeDefined();
    expect(byKey.get("ctrl+e")).toBeDefined();
    expect(byKey.get("ctrl+y")).toBeDefined();
    expect(byKey.get("ctrl+r")).toBeDefined();
    expect(byKey.get("ctrl+v")).toBeDefined();
    expect(byKey.get("escape")).toBeDefined();
    expect(byKey.get("tab")).toBeDefined();
    expect(byKey.get("?")).toBeDefined();
  });

  it("keeps Ctrl+C active from any state, modal included", () => {
    const bindings = createBaseBindings(makeActions(), makeConditions({ modalOpen: true }));
    const ctrlC = bindings.find((binding) => binding.key === "ctrl+c");
    expect(ctrlC).toBeDefined();
    expect(enabled(ctrlC!, makeConditions({ modalOpen: true }))).toBe(true);
  });

  it("stays inert while a modal is open, except Ctrl+C", () => {
    const conditions = makeConditions({ modalOpen: true });
    const bindings = createBaseBindings(makeActions(), conditions);
    const inert = bindings.filter((binding) => binding.key !== "ctrl+c");
    for (const binding of inert) {
      expect(enabled(binding, conditions), binding.key).toBe(false);
    }
  });

  it("gates result-only shortcuts on hasResult", () => {
    const withoutResult = makeConditions({ hasResult: false });
    const withResult = makeConditions({ hasResult: true });
    const bindings = createBaseBindings(makeActions(), withoutResult);
    for (const key of ["ctrl+d", "ctrl+e", "ctrl+y"]) {
      const binding = bindings.find((candidate) => candidate.key === key)!;
      expect(enabled(binding, withoutResult), key).toBe(false);
      expect(enabled(binding, withResult), key).toBe(true);
    }
  });

  it("opens help only on an empty prompt", () => {
    const bindings = createBaseBindings(makeActions(), makeConditions());
    const help = bindings.find((binding) => binding.key === "?");
    expect(help).toBeDefined();
    expect(enabled(help!, makeConditions({ inputEmpty: true }))).toBe(true);
    expect(enabled(help!, makeConditions({ inputEmpty: false }))).toBe(false);
  });

  it("runs the modal layer above the base layer", () => {
    expect(MODAL_LAYER_PRIORITY).toBeGreaterThan(BASE_LAYER_PRIORITY);
    const modalBindings = createModalBindings(makeActions());
    expect(modalBindings.map((binding) => binding.key)).toEqual(["escape"]);
  });
});
