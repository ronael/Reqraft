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

describe("le couple profil / niveau", () => {
  it("garde la même métrique dans les deux surfaces", async () => {
    // Ils sont côte à côte dans la capsule comme dans la barre de menus. La
    // barre les avait à 30px contre 16 : deux contrôles voisins de tailles
    // différentes, ce que la règle des boutons interdit.
    const profil = await ruleBody(".profile-chip");
    const niveau = await ruleBody(".level-toggle");

    expect(profil).toContain("font-size: 10px");
    expect(niveau).toContain("font-size: 10px");
    // Sans `min-height`, la règle `button` de base impose 30px et le couple
    // se désaligne.
    expect(niveau).toContain("min-height: 0");
  });

  it("n'a plus de déclencheur propre à une surface", async () => {
    // `.profile-trigger` était le bandeau de la barre de menus, remplacé par
    // la pastille commune : le laisser en feuille de style invite à le
    // rebrancher par erreur.
    const css = await readFile(STYLESHEET, "utf8");

    expect(css).not.toContain(".profile-trigger");
    expect(css).not.toContain(".chip-level");
  });
});

describe("l'entrée du sélecteur de profil", () => {
  it("n'anime que des propriétés sans effet sur la mise en page", async () => {
    // transform et opacity seulement : rien qui provoque un recalcul de layout
    // dans un panneau dont la hauteur est déjà contrainte par la fenêtre.
    const css = await readFile(STYLESHEET, "utf8");
    // Les keyframes sont en fin de fichier, après les règles `.profile-sheet` :
    // la borne de fin doit donc être cherchée à partir du début de la tranche.
    const start = css.indexOf("@keyframes rq-sheet-in");
    const frames = css.slice(start, css.indexOf(".profile-sheet {", start));

    expect(frames).toContain("transform:");
    expect(frames).toContain("opacity:");
    for (const forbidden of ["height:", "width:", "margin", "padding", "top:", "left:"]) {
      expect(frames, `une keyframe ne doit pas animer ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("prévoit un repli pour le mouvement réduit", async () => {
    // Sans lui, quelqu'un qui a désactivé les animations système subit quand
    // même le déplacement.
    const css = await readFile(STYLESHEET, "utf8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(block).toContain(".profile-sheet");
    expect(block).toContain("animation-duration: 1ms");
  });
});
