import { describe, expect, it } from "vitest";
import { filterSelectOptions, type SelectOption } from "@/apps/cli/ui/modal-options.js";
import { readFile } from "node:fs/promises";
import { visibleWindow } from "@/apps/cli/tui/model/overlay.js";

/**
 * Un sélecteur qui tient un catalogue de plusieurs dizaines de profils.
 *
 * Le contrat est le même que celui du sélecteur desktop : on cherche, on
 * regroupe, et la fenêtre ne grandit pas avec la liste. Ces deux fonctions sont
 * la moitié TUI de ce contrat, et elles sont pures — la liste peut donc être
 * mise à l'échelle sans rendre un seul terminal.
 */

function catalogue(count: number): SelectOption<string>[] {
  return [
    { label: "auto — détection", value: "auto" },
    ...Array.from({ length: count }, (_, index) => ({
      label: `profil-${String(index)} — description ${String(index)}`,
      value: `profil-${String(index)}`,
      section: "Mes profils",
      hint: "local",
    })),
    { label: "Nouveau profil", value: "::new-profile", kind: "action" as const },
  ];
}

describe("filterSelectOptions", () => {
  it("réduit un catalogue de plusieurs dizaines à ce qui correspond", () => {
    const options = catalogue(60);
    expect(options).toHaveLength(62);

    const matches = filterSelectOptions(options, "profil-42");
    // Le profil cherché, plus la ligne d'action qui reste toujours offerte.
    expect(matches.map((option) => option.value)).toEqual(["profil-42", "::new-profile"]);
  });

  it("cherche sans se soucier des accents ni de la casse", () => {
    const options: SelectOption<string>[] = [
      { label: "Rédaction — e-mails et messages", value: "redaction" },
    ];

    expect(filterSelectOptions(options, "REDACTION")).toHaveLength(1);
    expect(filterSelectOptions(options, "rédac")).toHaveLength(1);
  });

  it("garde la ligne d'action même quand rien ne correspond", () => {
    // Sans elle, une recherche infructueuse ferme la seule issue : créer le
    // profil qu'on ne trouve pas.
    const matches = filterSelectOptions(catalogue(10), "introuvable");

    expect(matches.map((option) => option.value)).toEqual(["::new-profile"]);
  });

  it("rend la liste entière quand la recherche est vide", () => {
    expect(filterSelectOptions(catalogue(10), "   ")).toHaveLength(12);
  });
});

describe("visibleWindow", () => {
  it("ne découpe rien tant que la liste tient", () => {
    expect(visibleWindow(0, 5, 10)).toEqual({ start: 0, end: 5 });
  });

  it("borne la tranche à la capacité, quelle que soit la taille du catalogue", () => {
    const window = visibleWindow(0, 500, 8);

    expect(window.end - window.start).toBe(8);
  });

  it("suit le surlignage vers le bas", () => {
    // C'est le défaut que la fonction existe pour corriger : les flèches
    // emmenaient le surlignage hors de la zone rendue.
    expect(visibleWindow(12, 60, 8, 0)).toEqual({ start: 5, end: 13 });
  });

  it("suit le surlignage vers le haut", () => {
    expect(visibleWindow(3, 60, 8, 20)).toEqual({ start: 3, end: 11 });
  });

  it("ne bouge pas tant que la ligne visée est déjà dedans", () => {
    // Une liste qui se recentre à chaque flèche est illisible pour d'autres
    // raisons : elle ne doit glisser que lorsqu'il le faut.
    expect(visibleWindow(6, 60, 8, 4)).toEqual({ start: 4, end: 12 });
  });

  it("ne dépasse jamais la fin de la liste", () => {
    expect(visibleWindow(59, 60, 8, 55)).toEqual({ start: 52, end: 60 });
  });

  it("survit à un index hors bornes", () => {
    expect(visibleWindow(999, 60, 8, 0)).toEqual({ start: 52, end: 60 });
    expect(visibleWindow(-5, 60, 8, 30)).toEqual({ start: 0, end: 8 });
  });

  it("rend une tranche vide plutôt que de casser sur une liste vide", () => {
    expect(visibleWindow(0, 0, 8)).toEqual({ start: 0, end: 0 });
  });
});

describe("la tranche glisse, elle ne saute pas", () => {
  it("épingle le surlignage en bas quand on descend, puis le laisse remonter", () => {
    // Recalculée depuis zéro à chaque rendu, la tranche gardait le surlignage
    // collé au bas du cadre : chaque flèche vers le haut faisait défiler toute
    // la liste. Le déroulé complet d'une descente puis d'une remontée.
    const capacity = 8;
    let start = 0;
    const positions: number[] = [];
    for (const index of [0, 4, 7, 8, 9, 8, 7, 6]) {
      const window = visibleWindow(index, 60, capacity, start);
      start = window.start;
      positions.push(start);
    }

    // On descend : la tranche ne bouge qu'à partir du moment où l'on sort.
    // On remonte : elle ne bouge plus tant que la ligne reste dedans.
    expect(positions).toEqual([0, 0, 0, 1, 2, 2, 2, 2]);
  });
});

describe("le sélecteur garde bien sa tranche", () => {
  it("passe la tranche précédente à `visibleWindow`", async () => {
    // Le test ci-dessus prouve la fonction ; celui-ci prouve le branchement.
    // Sans l'argument, le composant repart de zéro à chaque rendu et le défaut
    // que la fonction corrige revient intact, sans qu'aucun test pur ne bouge.
    const source = await readFile("src/apps/cli/tui/components/SelectPicker.tsx", "utf8");

    expect(source).toContain("capacity, previousStart.current)");
  });
});
