import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultEditor } from "@/apps/desktop/renderer/capsule/ResultEditor.js";
import { PromptEditor } from "@/apps/desktop/renderer/capsule/PromptEditor.js";
import { RESULT_ACCEPT_TEXT_MAX_LENGTH } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Les deux champs de la capsule, et le contrat visuel qu'ils tiennent.
 *
 * Ce fichier ne garde que ce qui se voit dans le balisage rendu ou dans la
 * feuille de style. Tout ce qui est comportement — quel texte part à la copie,
 * ce que la comparaison montre, ce que le clavier fait pendant l'édition — est
 * exercé sur la capsule montée dans `desktop-capsule-edit-flow.test.tsx`, où
 * l'on tape vraiment dans les champs et où l'on vérifie ce que le pont IPC
 * reçoit. Une ligne relue dans la source ne prouve pas un comportement.
 *
 * La géométrie réelle — hauteur du pied, débordement du corps, position de
 * l'annonce à 560 px de large — est mesurée dans la vraie fenêtre Electron par
 * le scénario `capsule-ui` (`tests/e2e/desktop.test.ts`).
 */

const STYLESHEET = "src/apps/desktop/renderer/shared/desktop.css";

/** Insensible à la casse : React 19 rend `readOnly`, le DOM lit `readonly`. */
function attribut(markup: string, nom: string, valeur = ""): boolean {
  const attendu = valeur === "" ? nom : `${nom}="${valeur}"`;
  return markup.toLowerCase().includes(attendu.toLowerCase());
}

function editeur(value: string, readOnly = false): string {
  return renderToStaticMarkup(
    <ResultEditor
      value={value}
      label="Résultat"
      readOnly={readOnly}
      onChange={() => undefined}
      onEditingChange={() => undefined}
    />,
  );
}

describe("le champ du résultat", () => {
  it("montre le texte, et laisse le modifier", () => {
    const markup = editeur("demande reformulée");

    expect(markup).toContain("<textarea");
    expect(markup).toContain("demande reformulée");
    expect(attribut(markup, "readonly")).toBe(false);
  });

  it("se fige pendant l'application", () => {
    // L'acceptation est partie avec un texte : le laisser changer ensuite
    // afficherait autre chose que ce qui est en train d'être appliqué.
    expect(attribut(editeur("demande reformulée", true), "readonly")).toBe(true);
  });

  it("tient la borne du contrat là où le texte se saisit", () => {
    // Refuser l'acceptation après coup laisserait quelqu'un devant un résultat
    // qu'il ne peut plus appliquer.
    expect(attribut(editeur("x"), "maxlength", String(RESULT_ACCEPT_TEXT_MAX_LENGTH))).toBe(true);
  });

  it("garde une seule ligne minimale comme l'ancien bloc de résultat", () => {
    expect(attribut(editeur("court"), "rows", "1")).toBe(true);
  });

  it("s'annonce, faute d'étiquette visible", () => {
    expect(editeur("x")).toContain('aria-label="Résultat"');
  });

  it("ne change pas visuellement au focus", async () => {
    const css = await readFile(STYLESHEET, "utf8");

    expect(css).not.toContain(".capsule-result:focus-within");
    expect(css).toContain(".capsule-result-input:focus {\n  outline: none;");
  });

  it("garde la géométrie et le style du bloc qu'il remplace", async () => {
    // Le champ succède à un `<pre class="capsule-stream">`. Il porte la même
    // classe — donc la même police, la même taille et le même interligne — et
    // n'annule que ce qu'un `textarea` ajoute de son côté. Sans cela le texte
    // sautait au moment où le résultat arrivait.
    expect(editeur("x")).toContain('class="capsule-stream capsule-result-input"');

    const css = await readFile(STYLESHEET, "utf8");
    const regle = css.slice(css.indexOf("\n.capsule-result-input {"));
    const corps = regle.slice(regle.indexOf("{") + 1, regle.indexOf("}"));

    for (const annule of [
      "padding: 0",
      "border: none",
      "resize: none",
      "background: transparent",
    ]) {
      expect(corps, `le champ doit annuler ${annule}`).toContain(annule);
    }
    // Ni police ni interligne redéclarés : ils viennent de `.capsule-stream`,
    // et une seconde déclaration ici les ferait diverger.
    expect(corps).not.toMatch(/(^|;|\s)font-family\s*:/);
    expect(corps).not.toMatch(/(^|;|\s)line-height\s*:/);
  });

  it("suit la hauteur du contenu sans mesurer", async () => {
    // Le conteneur duplique le texte dans son pseudo-élément : c'est le double
    // qui dicte la hauteur. Un `scrollHeight` recalculé à chaque frappe ferait
    // osciller le champ d'une ligne pendant la saisie.
    expect(editeur("deux\nlignes")).toContain('data-replicated-value="deux\nlignes"');

    const css = await readFile(STYLESHEET, "utf8");
    expect(css).toContain("content: attr(data-replicated-value)");
  });
});

describe("le prompt de départ", () => {
  it("est éditable après la génération", () => {
    const markup = renderToStaticMarkup(
      <PromptEditor
        value="demande initiale"
        label="Prompt de départ"
        readOnly={false}
        onChange={() => undefined}
        onEditingChange={() => undefined}
      />,
    );

    expect(markup).toContain("<textarea");
    expect(markup).toContain("demande initiale");
    expect(markup).toContain('aria-label="Prompt de départ"');
    expect(attribut(markup, "readonly")).toBe(false);
  });

  it("reste visuellement neutre au focus", async () => {
    const css = await readFile(STYLESHEET, "utf8");
    const rule = css.slice(css.indexOf(".capsule-source-input {"));
    const body = rule.slice(rule.indexOf("{") + 1, rule.indexOf("}"));

    expect(body).toContain("border: none");
    expect(body).toContain("outline: none");
    expect(body).toContain("background: transparent");
  });
});

describe("le bloc mesuré pour la hauteur de la fenêtre", () => {
  it("établit son propre contexte de formatage", async () => {
    // Sans `flow-root`, la marge basse du dernier enfant s'échappe du bloc :
    // la hauteur mesurée serait inférieure de dix pixels à celle occupée, et
    // la capsule couperait sa dernière ligne. Le scénario `capsule-ui` mesure
    // la conséquence ; cette règle en est la cause.
    const css = await readFile(STYLESHEET, "utf8");
    const rule = css.slice(css.indexOf(".capsule-content {"));

    expect(rule.slice(0, rule.indexOf("}"))).toContain("display: flow-root");
  });

  it("coupe les animations d'attente quand le système le demande", async () => {
    const css = await readFile(STYLESHEET, "utf8");

    expect(css).toContain(".capsule-bar,\n  .caret,\n  .pulse {\n    animation: none;");
  });
});
