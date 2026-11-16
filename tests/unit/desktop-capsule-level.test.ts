import { describe, expect, it } from "vitest";
import { cycleRepromptLevel, offersLowerLevel } from "@/apps/desktop/renderer/capsule/levels.js";
import type { RepromptResult } from "@/apps/desktop/shared/ipc-contract.js";

describe("cycleRepromptLevel", () => {
  it("avance dans les niveaux avec Tab", () => {
    expect(cycleRepromptLevel("minimal", 1)).toBe("standard");
    expect(cycleRepromptLevel("standard", 1)).toBe("complete");
    expect(cycleRepromptLevel("complete", 1)).toBe("minimal");
  });

  it("recule dans les niveaux avec Shift+Tab", () => {
    expect(cycleRepromptLevel("minimal", -1)).toBe("complete");
    expect(cycleRepromptLevel("standard", -1)).toBe("minimal");
    expect(cycleRepromptLevel("complete", -1)).toBe("standard");
  });
});

describe("offersLowerLevel", () => {
  const juste: RepromptResult = {
    original: "fais moi un point demain",
    rewritten: "Fais un point demain.",
    profile: "writing",
    level: "standard",
    provider: "mock",
    model: "mock-model",
    changes: [],
    quality: { status: "good", signals: [] },
  };
  const tropLong: RepromptResult = {
    ...juste,
    quality: {
      status: "review",
      signals: [{ code: "disproportionate_expansion", severity: "warning" }],
    },
  };

  it("propose de baisser un résultat trop long, tant qu'un niveau plus bas existe", () => {
    expect(offersLowerLevel(tropLong, "complete")).toBe(true);
    expect(offersLowerLevel(tropLong, "standard")).toBe(true);
  });

  it("ne propose rien sous « minimal », ni pour un résultat de la bonne longueur", () => {
    expect(offersLowerLevel(tropLong, "minimal")).toBe(false);
    expect(offersLowerLevel(juste, "standard")).toBe(false);
    expect(offersLowerLevel(null, "standard")).toBe(false);
  });
});
