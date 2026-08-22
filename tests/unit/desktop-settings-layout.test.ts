import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(process.cwd(), "src/apps/desktop/renderer/shared/desktop.css"),
  "utf8",
);

function ruleBody(selector: string): string {
  const match = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]+)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS rule ${selector}`);
  return match[1] ?? "";
}

describe("desktop settings layout", () => {
  it("keeps the shell fixed to the viewport so overflowing screens scroll internally", () => {
    const settings = ruleBody(".settings");
    const panel = ruleBody(".settings-panel");

    // `min-height: 100vh` lets the whole settings app grow beyond the window.
    // Because the desktop renderer hides body overflow, profile cards then get
    // clipped instead of making the panel scroll.
    expect(settings).toContain("height: 100vh");
    expect(settings).toContain("overflow: hidden");
    expect(panel).toContain("overflow-y: auto");
    expect(panel).toContain("min-height: 0");
  });
});
