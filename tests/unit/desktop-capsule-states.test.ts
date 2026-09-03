import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CAPSULE_STATES } from "@/apps/desktop/shared/capsule-machine.js";

/**
 * Chaque état de la capsule doit donner quelque chose à voir.
 *
 * `capture` n'avait aucune branche de rendu : le corps restait vide le temps
 * que la sélection revienne — ni texte, ni champ de saisie, ni barre
 * d'activité. Avec une permission macOS refusée, osascript enchaîne les
 * tentatives et ce vide dure assez longtemps pour passer pour un blocage.
 *
 * Le test lit la source plutôt que le DOM — la suite n'a pas d'environnement
 * DOM — mais il attrape la seule chose qui compte ici : un état oublié.
 */

const RENDERER = "src/apps/desktop/renderer/capsule/App.tsx";

/**
 * Le corps seul, entre la balise `capsule-body` et sa fermeture.
 *
 * Chercher dans tout le fichier ne prouve rien : la condition de la barre
 * d'activité mentionne `capture` sans rien afficher dans le corps, et cela
 * suffisait à faire passer le test alors que l'écran restait vide.
 */
async function corpsDeLaCapsule(): Promise<string> {
  const source = await readFile(RENDERER, "utf8");
  const debut = source.indexOf("capsule-body");
  return source.slice(debut, source.indexOf("</section>", debut));
}

describe("rendu de la capsule", () => {
  it("traite chaque état de la machine", async () => {
    const source = await corpsDeLaCapsule();
    const oublies = CAPSULE_STATES.filter((state) => {
      // `closed` n'a rien à rendre : la fenêtre est cachée. `generating` passe
      // par la constante nommée, pas par un littéral.
      if (state === "closed") return false;
      if (state === "generating") return !source.includes("state === GENERATING");
      // Strictement la comparaison d'état : `mode: "capture"` ou `beginCapture`
      // ne prouvent aucun rendu, et laissaient passer un état oublié.
      return !source.includes(`state === "${state}"`);
    });

    expect(oublies, `états sans rendu : ${oublies.join(", ")}`).toEqual([]);
  });

  it("montre la lecture de la sélection", async () => {
    expect(await corpsDeLaCapsule()).toContain('state === "capture"');
  });

  it("tout lancement de run passe par `analysis`", async () => {
    // ⌘R, ⇥ et la pastille de niveau appelaient `startRun` depuis `ready` sans
    // transition : `run-accepted` était alors refusé, et le run se déroulait
    // dans un état qui ne rend ni barre d'activité, ni réception, ni erreur.
    // L'utilisateur voyait « l'animation ne se relance pas ».
    //
    // La transition est donc dans `startRun`, pas chez ses appelants — c'est
    // la seule place où elle ne peut pas être oubliée.
    const source = await readFile(RENDERER, "utf8");
    const debut = source.indexOf("const startRun = useCallback(");
    const corps = source.slice(debut, source.indexOf("window.reqraft", debut));

    expect(corps).toContain('dispatch("rerun")');
  });

  it("n'impose pas le profil choisi dans une capsule à la capture suivante", async () => {
    const source = await readFile(RENDERER, "utf8");
    const resetStart = source.indexOf("const resetSession");
    const resetEnd = source.indexOf("const beginCapture", resetStart);

    expect(source.slice(resetStart, resetEnd)).toContain("setChosenProfile(null)");
  });
});
