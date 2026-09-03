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

function ownRuleBody(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`Missing CSS rule ${selector}`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

function reducedMotionBlocks(): string {
  return css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
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

describe("groupes de réglages partagés", () => {
  it("déclare la ligne une seule fois pour les deux familles de classes", () => {
    expect(css).toMatch(/\.settings-group-row,\n\.provider-row \{/);
    expect(css).toMatch(/\.settings-group,\n\.provider-list \{/);
    expect(css).toMatch(/\.settings-row-icon,\n\.provider-logo \{/);
    expect(css).toMatch(/\.settings-row-control,\n\.provider-key-control \{/);
  });

  it("met toutes les lignes d'un groupe à la même hauteur", () => {
    const rows = ownRuleBody(".settings-group-rows");

    expect(rows).toContain("display: grid");
    expect(rows).toContain("grid-auto-rows: 1fr");
  });

  it("donne au témoin d'état la boîte des boutons", () => {
    const state = ownRuleBody(".settings-state");
    const button = ownRuleBody("button");

    for (const property of ["min-height: 30px", "border-radius: 8px", "font-size: 12px"]) {
      expect(state, `.settings-state devrait déclarer ${property}`).toContain(property);
      expect(button, `button devrait déclarer ${property}`).toContain(property);
    }
  });

  it("aligne la combinaison en vigueur sur le sélecteur qui la change", () => {
    expect(ownRuleBody(".shortcut-control kbd")).toContain("min-height: 30px");
  });
});

describe("messages d'état", () => {
  it("déclare la géométrie une fois, sur la classe commune", () => {
    const base = ownRuleBody(".inline-message");

    for (const property of [
      "display: grid",
      "min-height",
      "padding",
      "border-radius",
      "font-size",
    ]) {
      expect(base, `.inline-message devrait déclarer ${property}`).toContain(property);
    }
  });

  for (const tone of ["pending", "success", "warning", "error"]) {
    it(`.inline-message-${tone} ne change que la couleur`, () => {
      const body = ownRuleBody(`.inline-message-${tone}`);

      for (const property of ["padding", "min-height", "font-size", "border-radius", "display"]) {
        expect(body, `un ton ne doit pas fixer ${property}`).not.toMatch(
          new RegExp(`(^|;|\\s)${property}\\s*:`),
        );
      }
      expect(body).not.toMatch(/(^|;|\s)border\s*:/);
    });
  }
});

describe("mouvement réduit", () => {
  it("neutralise toutes les entrées ajoutées aux réglages", () => {
    const block = reducedMotionBlocks();

    for (const selector of [
      ".settings-group-row-entering",
      ".settings-action-entering",
      ".settings-tab-entering",
      ".inline-message",
      ".spin",
    ]) {
      expect(block, `${selector} devrait avoir un repli`).toContain(selector);
    }
    expect(block).toContain("animation-duration: 1ms");
  });

  it("n'anime que des propriétés sans effet sur la mise en page", () => {
    const start = css.indexOf("@keyframes rq-spin");
    const frames = css.slice(start, css.indexOf("}", css.indexOf("}", start) + 1));

    expect(frames).toContain("transform:");
    for (const forbidden of ["height:", "width:", "margin", "padding", "top:", "left:"]) {
      expect(frames, `une keyframe ne doit pas animer ${forbidden}`).not.toContain(forbidden);
    }
  });
});
