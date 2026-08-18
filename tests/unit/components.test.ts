import { describe, expect, it } from "vitest";
import { actionLines, shortModel, wrapText } from "@/opentui/text.js";

describe("OpenTUI text helpers", () => {
  it("wraps long text without losing words", () => {
    expect(wrapText("crée une landing page premium", 12)).toEqual([
      "crée une lan",
      "ding page",
      "premium",
    ]);
  });

  it("keeps explicit line breaks", () => {
    expect(wrapText("ligne 1\nligne 2", 20)).toEqual(["ligne 1", "ligne 2"]);
  });

  it("shortens long model names for compact badges", () => {
    expect(shortModel("claude-sonnet-5-ultra-long")).toBe("claude-sonn…");
  });

  it("keeps the action bar inside the available width", () => {
    const lines = actionLines(24, 2, "streaming", ["^G Générer", "^P Profil", "^L Niveau"]);

    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.length === 24)).toBe(true);
    expect(lines.join("\n")).toContain("^G Générer");
  });
});
