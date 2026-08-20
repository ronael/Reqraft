import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTheme } from "@/apps/cli/tui/theme/index.js";
import { createTokens } from "@/apps/cli/tui/theme/tokens.js";

const TUI_ROOT = path.resolve("src/apps/cli/tui");

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("tui theme", () => {
  it("keeps every literal colour inside the token files", () => {
    // The whole point of the token layer: one file to edit when the design
    // changes. A hex value anywhere else silently opts that component out.
    const offenders = filesUnder(TUI_ROOT)
      .filter((file) => !file.endsWith(path.join("theme", "tokens.ts")))
      .filter((file) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(TUI_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("collapses every colour role when the terminal has no colour", () => {
    const mono = createTokens({ color: false, unicode: true });
    const roles = Object.values(mono.color);
    // Structure, not hue, has to carry meaning on a colourless terminal.
    expect(new Set(roles).size).toBeLessThanOrEqual(2);
  });

  it("falls back to a border style plain terminals can draw", () => {
    expect(createTokens({ color: true, unicode: false }).border.focused).toBe("single");
    expect(createTokens({ color: true, unicode: true }).border.focused).toBe("rounded");
  });

  it("derives component tokens from the global spacing scale", () => {
    const theme = createTheme({ color: true, unicode: true });
    expect(theme.components.surface.paddingX.comfortable).toBe(theme.tokens.spacing.sm);
    expect(theme.components.surface.paddingX.compact).toBe(theme.tokens.spacing.xs);
    // Compact must actually be tighter, or the density variant is decorative.
    expect(theme.components.surface.paddingX.compact).toBeLessThan(
      theme.components.surface.paddingX.comfortable,
    );
  });

  it("uses a backdrop only when the terminal can render a useful dimmed layer", () => {
    expect(
      createTheme({ color: true, unicode: true }).components.dialog.backdropOpacity,
    ).toBeGreaterThan(0);
    expect(createTheme({ color: false, unicode: true }).components.dialog.backdropOpacity).toBe(0);
  });

  it("keeps spacing in whole terminal cells", () => {
    const { spacing } = createTokens({ color: true, unicode: true });
    for (const value of Object.values(spacing)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});
