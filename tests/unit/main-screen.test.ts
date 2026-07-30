import { describe, expect, it } from "vitest";
import { getHeaderStatus } from "../../src/ui/header-status.js";
import { describeResultMeta, getResultPanelTone } from "../../src/ui/result-meta.js";
import { getShortcutHints } from "../../src/ui/shortcut-hints.js";
import { describeUiError } from "../../src/ui/errors.js";
import type { RepromptResult } from "../../src/core/types.js";

const result: RepromptResult = {
  original: "test",
  rewritten: "Test.",
  profile: "auto",
  level: "standard",
  provider: "mock",
  model: "mock-model",
  changes: [],
  warnings: [],
  quality: { status: "good", signals: [] },
  latencyMs: 1_120,
  usage: { visibleOutputTokens: 31 },
};

describe("header status", () => {
  it("announces readiness before anything happens", () => {
    expect(getHeaderStatus({ isLoading: false, hasError: false, hasResult: false })).toEqual({
      tone: "success",
      label: "prêt",
    });
  });

  it("announces the run while it is in flight", () => {
    expect(getHeaderStatus({ isLoading: true, hasError: false, hasResult: true }).label).toBe(
      "génération",
    );
  });

  it("lets failure win over a stale result", () => {
    expect(getHeaderStatus({ isLoading: false, hasError: true, hasResult: true })).toEqual({
      tone: "danger",
      label: "erreur",
    });
  });

  it("confirms a finished run", () => {
    expect(getHeaderStatus({ isLoading: false, hasError: false, hasResult: true }).label).toBe(
      "terminé",
    );
  });
});

describe("result panel metadata", () => {
  it("waits before the first run", () => {
    expect(describeResultMeta(null, false)).toBe("en attente");
  });

  it("reports progress during the run", () => {
    expect(describeResultMeta(null, true)).toBe("en cours…");
  });

  it("reports tokens and elapsed time once finished", () => {
    expect(describeResultMeta(result, false)).toBe("31 tokens · 1.12 s");
  });

  it("omits what the provider did not report", () => {
    expect(describeResultMeta({ ...result, usage: undefined, latencyMs: undefined }, false)).toBe(
      "",
    );
  });
});

describe("result panel tone", () => {
  it.each([
    [{ isLoading: false, hasError: false, hasResult: false }, "secondary"],
    [{ isLoading: true, hasError: false, hasResult: false }, "primary"],
    [{ isLoading: false, hasError: false, hasResult: true }, "success"],
    [{ isLoading: false, hasError: true, hasResult: true }, "danger"],
  ] as const)("resolves %o to %s", (status, expected) => {
    expect(getResultPanelTone(status)).toBe(expected);
  });
});

describe("shortcut hints", () => {
  it("collapses to the interrupt during a generation", () => {
    const hints = getShortcutHints({ compact: false, hasResult: true, isGenerating: true });
    expect(hints).toEqual([{ keyLabel: "^C", action: "Interrompre" }]);
  });

  it("dims result-only actions instead of hiding them, so the bar never reflows", () => {
    const idle = getShortcutHints({ compact: false, hasResult: false, isGenerating: false });
    const ready = getShortcutHints({ compact: false, hasResult: true, isGenerating: false });

    expect(idle).toHaveLength(ready.length);
    expect(idle.find((hint) => hint.keyLabel === "^D")?.disabled).toBe(true);
    expect(ready.find((hint) => hint.keyLabel === "^D")?.disabled).toBe(false);
  });

  it("keeps generating available at every width", () => {
    for (const compact of [true, false]) {
      const hints = getShortcutHints({ compact, hasResult: false, isGenerating: false });
      expect(hints.some((hint) => hint.keyLabel === "Entrée")).toBe(true);
    }
  });

  it("never advertises Ctrl+Enter", () => {
    const hints = getShortcutHints({ compact: false, hasResult: true, isGenerating: false });
    expect(hints.every((hint) => !hint.keyLabel.includes("^Entrée"))).toBe(true);
  });
});

describe("structured errors", () => {
  it("splits an auth failure into a title and an action", () => {
    const described = describeUiError(new Error("Provider error 401: leaked"), "openai");

    expect(described.title).toBe("Clé API refusée");
    expect(described.nextAction).toContain("rp auth login openai");
    expect(JSON.stringify(described)).not.toContain("leaked");
  });

  it("keeps an unknown failure readable", () => {
    const described = describeUiError(new Error("Réseau injoignable"), "openai");

    expect(described).toEqual({ title: "Erreur", message: "Réseau injoignable" });
  });
});
