import { describe, expect, it } from "vitest";
import {
  FALLBACK_SIZE,
  getFrameWidth,
  getHeightMode,
  getLayoutMode,
  normalizeSize,
} from "../../src/ui/layout/responsive.js";

describe("layout mode", () => {
  // The widths DA.md section 16 requires to be exercised.
  it.each([
    [40, "narrow"],
    [60, "compact"],
    [80, "wide"],
    [100, "wide"],
    [120, "wide"],
  ] as const)("resolves %i columns to %s", (columns, expected) => {
    expect(getLayoutMode(columns)).toBe(expected);
  });

  it("switches exactly on the documented boundaries", () => {
    expect(getLayoutMode(51)).toBe("narrow");
    expect(getLayoutMode(52)).toBe("compact");
    expect(getLayoutMode(75)).toBe("compact");
    expect(getLayoutMode(76)).toBe("wide");
  });
});

describe("height mode", () => {
  it("treats a short terminal as constrained", () => {
    expect(getHeightMode(12)).toBe("short");
    expect(getHeightMode(19)).toBe("short");
  });

  it("treats a standard terminal as regular", () => {
    expect(getHeightMode(20)).toBe("regular");
    expect(getHeightMode(50)).toBe("regular");
  });
});

describe("frame width", () => {
  it("caps large terminals so lines stay readable", () => {
    expect(getFrameWidth(200)).toBe(112);
  });

  it("follows the terminal below the cap", () => {
    expect(getFrameWidth(80)).toBe(80);
  });

  it("keeps a usable floor on tiny terminals", () => {
    expect(getFrameWidth(5)).toBe(20);
  });
});

describe("normalizeSize", () => {
  it("passes through a real size", () => {
    expect(normalizeSize({ columns: 100, rows: 30 })).toEqual({ columns: 100, rows: 30 });
  });

  it("falls back when the terminal reports nothing, as happens off a TTY", () => {
    expect(normalizeSize({})).toEqual(FALLBACK_SIZE);
    expect(normalizeSize({ columns: undefined, rows: undefined })).toEqual(FALLBACK_SIZE);
  });

  it("rejects values that would produce a broken layout", () => {
    expect(normalizeSize({ columns: 0, rows: 0 })).toEqual(FALLBACK_SIZE);
    expect(normalizeSize({ columns: Number.NaN, rows: -5 })).toEqual(FALLBACK_SIZE);
  });
});
