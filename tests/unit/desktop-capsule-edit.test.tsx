import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultEditor } from "@/apps/desktop/renderer/capsule/ResultEditor.js";
import { RESULT_ACCEPT_TEXT_MAX_LENGTH } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Le résultat final, repris à la main.
 *
 * Ce qui compte n'est pas que le champ existe, mais qu'il n'y ait qu'une seule
 * version du texte : celle qu'on voit est celle qui part. Une deuxième source
 * — le résultat du modèle laissé quelque part — finirait par faire copier
 * autre chose que ce que la comparaison montre.
 *
 * La suite tourne sous Node sans DOM : le rendu se vérifie en balisage, et le
 * câblage de la capsule en relisant sa source. Ce que le clavier fait pendant
 * l'édition est vérifié en appelant les fonctions, dans
 * `desktop-capsule-keyboard.test.ts`.
 */

const RENDERER = "src/apps/desktop/renderer/capsule/App.tsx";
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

async function source(): Promise<string> {
  return readFile(RENDERER, "utf8");
}

/** Le corps du composant `App`, sans ses sous-composants. */
async function corpsDeApp(): Promise<string> {
  const s = await source();
  return s.slice(s.indexOf("export function App()"));
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
    // osciller la capsule d'une ligne pendant la saisie.
    expect(editeur("deux\nlignes")).toContain('data-replicated-value="deux\nlignes"');

    const css = await readFile(STYLESHEET, "utf8");
    expect(css).toContain("content: attr(data-replicated-value)");
  });
});

describe("une seule version du texte", () => {
  it("copie et remplace la version affichée", async () => {
    const corps = await corpsDeApp();

    // Les deux chemins passent par le même calcul, qui refuse un texte vide et
    // rend `undefined` quand rien n'a été repris.
    for (const appel of [
      'acceptResult(runId, "replace", texte.text)',
      'acceptResult(runId, "copy", texte.text)',
    ]) {
      expect(corps, `${appel} manquant`).toContain(appel);
    }
    expect(corps).not.toContain('acceptResult(runId, "copy")');
    expect(corps).not.toContain('acceptResult(runId, "replace")');
  });

  it("compare la version affichée, pas celle du modèle", async () => {
    const corps = await corpsDeApp();
    const diff = corps.slice(corps.indexOf('className="diff-after"'));

    expect(diff.slice(0, 80)).toContain("finalText");
    expect(corps).not.toContain("+ {result.rewritten}");
  });

  it("affiche la version reprise dès qu'elle existe", async () => {
    const corps = await corpsDeApp();

    expect(corps).toContain('const finalText = edited ?? result?.rewritten ?? ""');
    expect(corps).toContain("value={finalText}");
  });
});

describe("une nouvelle génération repart du texte du modèle", () => {
  /**
   * Les trois portes par lesquelles un run recommence.
   *
   * Une édition laissée derrière ferait copier et remplacer un texte que plus
   * rien à l'écran ne montre — et la capsule resterait sourde au clavier si
   * `editing` survivait au démontage du champ.
   */
  const DEPARTS = [
    "const startRun = useCallback(",
    "const startRunAvecProfil = useCallback(",
    "const resetSession = useCallback(",
  ];

  it.each(DEPARTS)("%s efface l'édition", async (depart) => {
    const s = await source();
    const debut = s.indexOf(depart);
    expect(debut, `${depart} introuvable`).toBeGreaterThan(-1);
    const corps = s.slice(debut, s.indexOf("useCallback(", debut + depart.length));

    expect(corps).toContain("setEdited(null)");
    expect(corps).toContain("setEditing(false)");
  });

  it("ne laisse pas une édition démontée rendre la capsule sourde", async () => {
    // Un champ démonté n'émet pas toujours son `blur` : croiser avec l'état
    // rend cette survivance sans effet.
    const corps = await corpsDeApp();

    expect(corps).toContain('editing: editing && state === "ready"');
  });
});
