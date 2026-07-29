import { describe, expect, it } from "vitest";
import { getFrameWidth, getLayoutMode } from "../../src/ui/layout/responsive.js";
import {
  getCommandOptions,
  getFallbackModelForProvider,
  getModelOptions,
  getProfileOptions,
  HELP_OPTIONS,
  LEVEL_OPTIONS,
} from "../../src/ui/modal-options.js";
import { formatDiff, formatExplain, formatResultView } from "../../src/ui/result-view.js";
import { shouldUseColor } from "../../src/ui/text.js";
import type { RepromptResult } from "../../src/core/types.js";
import { qualitySignalViewKey } from "../../src/ui/components/quality-notice.js";
import {
  beginGeneration,
  canStartGeneration,
  completeCopy,
  failCopy,
  failGeneration,
} from "../../src/ui/generation-state.js";

describe("terminal layout", () => {
  it.each([
    [40, "narrow"],
    [52, "compact"],
    [75, "compact"],
    [76, "wide"],
    [120, "wide"],
  ] as const)("uses the expected mode at %i columns", (columns, expected) => {
    expect(getLayoutMode(columns)).toBe(expected);
  });

  it("constrains large terminals without overflowing small ones", () => {
    expect(getFrameWidth(48)).toBe(48);
    expect(getFrameWidth(80)).toBe(80);
    expect(getFrameWidth(160)).toBe(112);
  });
});

describe("terminal color fallback", () => {
  it("only uses colors on a TTY when NO_COLOR is absent", () => {
    expect(shouldUseColor(true, undefined)).toBe(true);
    expect(shouldUseColor(false, undefined)).toBe(false);
    expect(shouldUseColor(true, "1")).toBe(false);
  });
});

describe("quality notice", () => {
  it("keeps React keys unique when several model warnings share the same code", () => {
    const first = qualitySignalViewKey(
      { code: "model_warning", severity: "warning", message: "Premier warning" },
      0,
    );
    const second = qualitySignalViewKey(
      { code: "model_warning", severity: "warning", message: "Second warning" },
      1,
    );

    expect(first).not.toBe(second);
  });
});

describe("result view formatting", () => {
  const result: RepromptResult = {
    original: "corrige ceci\nmerci",
    rewritten: "Corrige ceci, merci.",
    profile: "auto",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: ["Correction de la casse.", "Ponctuation ajoutée."],
    warnings: ["Ambiguïté conservée."],
    quality: { status: "review", signals: [] },
  };

  it("returns the rewritten prompt for the result view", () => {
    expect(formatResultView(result, "result")).toBe("Corrige ceci, merci.");
  });

  it("formats changed lines as a compact diff", () => {
    expect(formatDiff(result.original, result.rewritten)).toBe(
      "- corrige ceci\n+ Corrige ceci, merci.\n- merci\n+ ",
    );
  });

  it("formats changes and warnings for the explain view", () => {
    expect(formatExplain(result)).toBe(
      [
        "Modifications :",
        "- Correction de la casse.",
        "- Ponctuation ajoutée.",
        "",
        "Avertissements :",
        "- Ambiguïté conservée.",
      ].join("\n"),
    );
  });
});

describe("modal options", () => {
  it("keeps level and help options centralized", () => {
    expect(LEVEL_OPTIONS.map((option) => option.value)).toEqual([
      "minimal",
      "standard",
      "complete",
    ]);
    expect(HELP_OPTIONS.map((option) => option.value)).toContain("regenerate");
  });

  it("builds profile and model choices from registries", () => {
    expect(getProfileOptions()[0]).toEqual({ label: "auto (détection)", value: "auto" });
    expect(getModelOptions("openai").map((option) => option.value)).toContain("gpt-4.1-mini");
    expect(getFallbackModelForProvider("openai")).toBe("gpt-4.1-mini");
  });

  it("only exposes result actions after a generation exists", () => {
    expect(getCommandOptions(false).map((option) => option.value)).not.toContain("copy");
    expect(getCommandOptions(true).map((option) => option.value)).toEqual([
      "generate",
      "profile",
      "level",
      "provider",
      "model",
      "result",
      "diff",
      "explain",
      "copy",
    ]);
  });
});

describe("generation state", () => {
  it("does not start empty or concurrent generations", () => {
    expect(canStartGeneration("", false)).toBe(false);
    expect(canStartGeneration("   ", false)).toBe(false);
    expect(canStartGeneration("corrige ça", true)).toBe(false);
    expect(canStartGeneration("corrige ça", false)).toBe(true);
  });

  it("keeps the previous result visible while a new request starts or fails", () => {
    const previous = { rewritten: "Résultat payé" };
    const started = beginGeneration({ error: "ancienne erreur", result: previous, modal: null });
    const failed = failGeneration(started, "nouvelle erreur");

    expect(started).toEqual({ error: null, result: previous, modal: null });
    expect(failed).toEqual({ error: "nouvelle erreur", result: previous, modal: null });
  });
});

describe("clipboard state", () => {
  it("marks a successful copy and optionally closes the modal", () => {
    const copied = completeCopy(
      { copied: false, error: "ancienne erreur", modal: "commands" },
      true,
    );

    expect(copied).toEqual({ copied: true, error: null, modal: null });
  });

  it("surfaces copy failures without changing the current modal", () => {
    const failed = failCopy({ copied: true, error: null, modal: "commands" }, "copie impossible");

    expect(failed).toEqual({ copied: false, error: "copie impossible", modal: "commands" });
  });
});
