import { describe, expect, it } from "vitest";
import { computeWindow, filterItems, moveIndex } from "@/ui/select-list.js";

const models = [
  { label: "gpt-4.1-mini", value: "a", description: "OpenAI recommandé" },
  { label: "gpt-5-mini", value: "b" },
  { label: "claude-haiku-4-5", value: "c", description: "Anthropic rapide" },
  { label: "mistral-small-2603", value: "d" },
];

describe("filterItems", () => {
  it("returns everything on an empty query", () => {
    expect(filterItems(models, "")).toHaveLength(4);
  });

  it("matches anywhere in the label, not only at the start", () => {
    expect(filterItems(models, "mini").map((item) => item.value)).toEqual(["a", "b"]);
  });

  it("ignores case", () => {
    expect(filterItems(models, "GPT")).toHaveLength(2);
  });

  it("ignores accents, so « recommandé » is reachable without them", () => {
    expect(filterItems(models, "recommande").map((item) => item.value)).toEqual(["a"]);
  });

  it("searches the description too", () => {
    expect(filterItems(models, "anthropic").map((item) => item.value)).toEqual(["c"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterItems(models, "zzz")).toEqual([]);
  });
});

describe("moveIndex", () => {
  it("moves within the list", () => {
    expect(moveIndex(0, 1, 4)).toBe(1);
    expect(moveIndex(2, -1, 4)).toBe(1);
  });

  it("wraps at both ends", () => {
    expect(moveIndex(3, 1, 4)).toBe(0);
    expect(moveIndex(0, -1, 4)).toBe(3);
  });

  it("stays at zero on an empty list", () => {
    expect(moveIndex(0, 1, 0)).toBe(0);
  });
});

describe("computeWindow", () => {
  const long = Array.from({ length: 20 }, (_, index) => ({
    label: `item-${String(index)}`,
    value: String(index),
  }));

  it("shows everything when the list fits", () => {
    const view = computeWindow(models, 1, 8);

    expect(view.visible).toHaveLength(4);
    expect(view.highlightedOffset).toBe(1);
    expect(view.hasMoreAbove).toBe(false);
    expect(view.hasMoreBelow).toBe(false);
  });

  it("scrolls a long list and flags what is hidden", () => {
    const view = computeWindow(long, 10, 8);

    expect(view.visible).toHaveLength(8);
    expect(view.hasMoreAbove).toBe(true);
    expect(view.hasMoreBelow).toBe(true);
  });

  it("keeps the highlighted entry inside the window at the top", () => {
    const view = computeWindow(long, 0, 8);

    expect(view.visible[view.highlightedOffset]?.value).toBe("0");
    expect(view.hasMoreAbove).toBe(false);
  });

  it("keeps the highlighted entry inside the window at the bottom", () => {
    const view = computeWindow(long, 19, 8);

    expect(view.visible[view.highlightedOffset]?.value).toBe("19");
    expect(view.hasMoreBelow).toBe(false);
  });

  it("never reports a highlighted entry outside the window", () => {
    for (let index = 0; index < long.length; index++) {
      const view = computeWindow(long, index, 8);
      expect(view.highlightedOffset).toBeGreaterThanOrEqual(0);
      expect(view.highlightedOffset).toBeLessThan(view.visible.length);
    }
  });
});
