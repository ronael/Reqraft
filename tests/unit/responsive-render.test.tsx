import React from "react";
import { describe, expect, it } from "vitest";
import { frameOf, widestLine } from "../helpers/render.js";
import { HeaderBar } from "../../src/ui/components/header-bar.js";
import { ShortcutBar } from "../../src/ui/components/shortcut-bar.js";
import { AppFrame } from "../../src/ui/components/app-frame.js";
import { Panel } from "../../src/ui/components/panel.js";
import { getFrameWidth, getLayoutMode } from "../../src/ui/layout/responsive.js";
import { clipLines, resultRowBudget } from "../../src/ui/viewport.js";

/**
 * Widths DA.md section 26 requires to be exercised.
 *
 * ink-testing-library hardcodes a 100-column terminal, so the 120-column case
 * is covered by the pure layout tests instead: getFrameWidth caps the frame at
 * 112, which cannot be drawn inside the harness.
 */
const WIDTHS = [40, 60, 80] as const;

describe("responsive rendering", () => {
  it.each(WIDTHS)("keeps the header inside %i columns", (columns) => {
    const frame = frameOf(
      <AppFrame mode={getLayoutMode(columns)} width={getFrameWidth(columns)}>
        <HeaderBar
          provider="openai"
          model="gpt-4.1-mini"
          width={getFrameWidth(columns)}
          status={{ tone: "success", label: "prêt" }}
        />
      </AppFrame>,
    );

    expect(frame).toContain("reqraft");
    expect(frame).toContain("prêt");
    expect(widestLine(frame)).toBeLessThanOrEqual(getFrameWidth(columns));
  });

  it("drops the baseline before the identity on a narrow terminal", () => {
    const wide = frameOf(
      <HeaderBar
        provider="openai"
        model="gpt-4.1-mini"
        width={100}
        status={{ tone: "success", label: "prêt" }}
      />,
    );
    const narrow = frameOf(
      <HeaderBar
        provider="openai"
        model="gpt-4.1-mini"
        width={40}
        status={{ tone: "success", label: "prêt" }}
      />,
    );

    expect(wide).toContain("Shape the request");
    expect(narrow).not.toContain("Shape the request");
    expect(narrow).toContain("reqraft");
    expect(narrow).toContain("prêt");
  });

  it.each(WIDTHS)("keeps a panel inside %i columns", (columns) => {
    const frame = frameOf(
      <AppFrame mode={getLayoutMode(columns)} width={getFrameWidth(columns)}>
        <Panel title="Prompt amélioré" meta="31 tokens · 1.12 s" tone="success">
          <></>
        </Panel>
      </AppFrame>,
    );

    expect(widestLine(frame)).toBeLessThanOrEqual(getFrameWidth(columns));
  });

  it("always offers a way to generate, at every width", () => {
    for (const columns of WIDTHS) {
      const frame = frameOf(
        <ShortcutBar compact={getLayoutMode(columns) !== "wide"} hasResult={false} />,
      );
      expect(frame).toContain("Entrée");
    }
  });

  it("shows only the interrupt during a generation", () => {
    const frame = frameOf(<ShortcutBar compact={false} hasResult isGenerating />);

    expect(frame).toContain("Interrompre");
    expect(frame).not.toContain("Profil");
  });
});

describe("vertical budget", () => {
  it("leaves the result room on a tall terminal", () => {
    expect(resultRowBudget(40)).toBeGreaterThan(resultRowBudget(24));
  });

  it("keeps a usable floor on a very short terminal", () => {
    expect(resultRowBudget(10)).toBeGreaterThanOrEqual(3);
    expect(resultRowBudget(1)).toBeGreaterThanOrEqual(3);
  });
});

describe("long results", () => {
  const long = Array.from({ length: 50 }, (_, index) => `ligne ${String(index)}`).join("\n");

  it("keeps short results whole", () => {
    expect(clipLines("une ligne", 10)).toEqual({ lines: ["une ligne"], hiddenBelow: 0 });
  });

  it("never clips silently", () => {
    const clipped = clipLines(long, 10);

    expect(clipped.lines).toHaveLength(10);
    expect(clipped.hiddenBelow).toBe(40);
  });

  it("reports the exact number of hidden lines", () => {
    expect(clipLines(long, 10).hiddenBelow + clipLines(long, 10).lines.length).toBe(50);
  });
});
