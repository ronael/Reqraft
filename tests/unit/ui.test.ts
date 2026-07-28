import { describe, expect, it } from "vitest";
import { getFrameWidth, getLayoutMode } from "../../src/ui/layout/responsive.js";
import { shouldUseColor } from "../../src/ui/text.js";

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
