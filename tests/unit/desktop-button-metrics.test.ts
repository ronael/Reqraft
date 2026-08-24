import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * One box for every button (AGENTS.md, §UI).
 *
 * Two buttons side by side being different sizes is the first thing anyone
 * notices, and it happened here: `.chip` set its own padding and font size, and
 * `.button-secondary` added a border where `.button-primary` had none. The rule
 * is that geometry is declared once on `button`, and variants change colour and
 * weight only — this fails if a variant starts setting its own again.
 */

const STYLESHEET = "src/apps/desktop/renderer/shared/desktop.css";

/** The declarations inside one rule, given its exact selector. */
async function ruleBody(selector: string): Promise<string> {
  const css = await readFile(STYLESHEET, "utf8");
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `règle ${selector} introuvable`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

/** Properties that change a control's box, and therefore its size. */
const GEOMETRY = ["padding", "min-height", "height", "font-size", "border-radius", "line-height"];

describe("métrique partagée des boutons", () => {
  it("déclare la géométrie sur l'élément de base", async () => {
    const base = await ruleBody("button");

    for (const property of GEOMETRY) {
      expect(base, `button devrait déclarer ${property}`).toContain(`${property}:`);
    }
  });

  it("réserve la boîte de bordure sur tous les boutons", async () => {
    // Without this a bordered variant is two pixels taller than a bare one —
    // exactly the mismatch this rule exists to prevent.
    expect(await ruleBody("button")).toContain("border: 1px solid transparent");
  });

  for (const variant of [
    ".button-primary",
    ".button-secondary",
    ".chip",
    ".chip-active",
    ".chip-danger",
  ]) {
    it(`${variant} ne redéfinit aucune géométrie`, async () => {
      const body = await ruleBody(variant);

      for (const property of GEOMETRY) {
        expect(body, `${variant} ne doit pas fixer ${property}`).not.toMatch(
          new RegExp(`(^|;|\\s)${property}\\s*:`),
        );
      }
      // A variant setting `border` wholesale would drop the reserved box; only
      // `border-color` is its business.
      expect(body).not.toMatch(/(^|;|\s)border\s*:/);
    });
  }
});

describe("les boutons qui sortent de la métrique le disent", () => {
  it("garde le bouton icône carré", async () => {
    // `min-height` on the base rule outranks a smaller `height`, so a 28px
    // square silently became 30×28 the moment the shared metric landed. A
    // fixed height has to be paired with its own `min-height` to hold.
    const body = await ruleBody(".icon-button");

    expect(body).toContain("height: 28px");
    expect(body).toContain("min-height: 28px");
  });

  it("laisse la navigation aligner son libellé à gauche", async () => {
    // The shared box centres its content, which is right for an action button
    // and wrong for a full-width row.
    expect(await ruleBody(".settings-nav-item")).toContain("justify-content: flex-start");
  });
});

describe("le déclencheur de profil partage sa rangée", () => {
  it("flexe au lieu de prendre toute la largeur", async () => {
    // `width: 100%` took the whole line and wrapped the level chip below it.
    // The collapsed popover is what is on screen at all times.
    const body = await ruleBody(".profile-trigger");

    expect(body).toContain("flex: 1 1 auto");
    expect(body).not.toMatch(/(^|;|\s)width\s*:\s*100%/);
  });
});
