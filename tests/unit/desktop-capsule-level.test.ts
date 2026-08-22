import { describe, expect, it } from "vitest";
import { cycleRepromptLevel } from "@/apps/desktop/renderer/capsule/App.js";

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
