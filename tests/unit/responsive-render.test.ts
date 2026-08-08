import { describe, expect, it } from "vitest";
import { createLayout, pickerOptionIndexAt } from "../../src/opentui/layout.js";

const WIDTHS = [40, 60, 80, 120] as const;

describe("OpenTUI responsive layout", () => {
  it.each(WIDTHS)("keeps the frame inside %i columns", (columns) => {
    const layout = createLayout(columns, 32, "openai", "gpt-4.1-mini");

    expect(layout.width).toBeLessThanOrEqual(Math.max(48, columns));
    expect(layout.textWidth).toBeLessThan(layout.width);
  });

  it("preserves a visible footer and result area on short terminals", () => {
    const layout = createLayout(80, 18, "openai", "gpt-4.1-mini");

    expect(layout.actionRows).toBeGreaterThanOrEqual(1);
    expect(layout.resultRows).toBeGreaterThanOrEqual(2);
    expect(layout.editorRows).toBeGreaterThanOrEqual(2);
  });

  it("caps very wide terminals to the designed frame", () => {
    expect(createLayout(200, 40, "openai", "gpt-4.1-mini").width).toBe(118);
  });

  it("maps picker rows to option indexes", () => {
    const layout = createLayout(100, 34, "openai", "gpt-4.1-mini");

    expect(pickerOptionIndexAt(layout, layout.pickerTop + 4, 3)).toBe(0);
    expect(pickerOptionIndexAt(layout, layout.pickerTop + 6, 3)).toBe(1);
    expect(pickerOptionIndexAt(layout, layout.pickerTop + 10, 3)).toBeNull();
  });
});
