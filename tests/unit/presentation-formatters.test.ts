import { describe, expect, it } from "vitest";
import {
  formatCost,
  formatDuration,
  formatTokenMetric,
  formatTokenValue,
  qualityLabel,
} from "@/apps/cli/ui/formatters.js";

describe("presentation formatters", () => {
  it("formats durations consistently across CLI and TUI", () => {
    expect(formatDuration(999)).toBe("999 ms");
    expect(formatDuration(1234)).toBe("1.23 s");
  });

  it("formats token values and labelled token metrics", () => {
    expect(formatTokenValue(undefined)).toBe("non communiqué");
    expect(formatTokenValue(42)).toBe("42 tokens");
    expect(formatTokenMetric("entrée", 42)).toBe("42 tokens entrée");
    expect(formatTokenMetric("entrée", undefined)).toBeUndefined();
  });

  it("formats costs and quality labels", () => {
    expect(formatCost(0.0001234, "USD")).toBe("0.000123 USD");
    expect(formatCost(0.0001234)).toBe("0.000123");
    expect(qualityLabel("good")).toBe("correcte");
    expect(qualityLabel("review")).toBe("à vérifier");
    expect(qualityLabel("risky")).toBe("risquée");
  });
});
