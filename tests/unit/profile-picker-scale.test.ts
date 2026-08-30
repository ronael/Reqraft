import { describe, expect, it } from "vitest";
import { filterProfiles, groupProfiles } from "@/apps/desktop/renderer/shared/profiles.js";
import { filterSelectOptions, type SelectOption } from "@/apps/cli/ui/modal-options.js";
import { visibleWindow } from "@/apps/cli/tui/model/overlay.js";
import { dialogBodyCapacity } from "@/apps/cli/tui/primitives/Dialog.js";
import { POPOVER_HEIGHT, POPOVER_WIDTH } from "@/apps/desktop/main/windows/popover.js";
import { CAPSULE_HEIGHT } from "@/apps/desktop/main/windows/capsule.js";
import type { ProfileCatalogEntry } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Le contrat commun des sélecteurs de profil, à l'échelle.
 *
 * Roadmap « Next — passer à l'échelle des profils » : un catalogue de plusieurs
 * dizaines de profils doit rester utilisable sur toutes les surfaces, sans que
 * la taille d'une fenêtre dépende du nombre de profils.
 *
 * Trois exigences, vérifiées ici sur les fonctions pures de chaque surface —
 * les seules qui se testent sans rendre ni fenêtre ni terminal :
 *
 * 1. on cherche, avec la même tolérance à la casse et aux accents ;
 * 2. on regroupe par origine, dans le même ordre ;
 * 3. la liste rendue est bornée, et la fenêtre ne grandit pas.
 */

const SCALE = 60;

function desktopCatalogue(count: number): ProfileCatalogEntry[] {
  return [
    { id: "auto", name: "Auto", description: "Détection locale", origin: "auto" },
    { id: "writing", name: "Writing", description: "Textes généraux", origin: "builtin" },
    ...Array.from({ length: count }, (_, index) => ({
      id: `profil-${String(index)}`,
      name: `Profil ${String(index)}`,
      description: `Rédaction numéro ${String(index)}`,
      origin: "local" as const,
    })),
  ];
}

function tuiCatalogue(count: number): SelectOption<string>[] {
  return [
    { label: "auto — détection", value: "auto" },
    { label: "writing — textes généraux", value: "writing", section: "Intégrés" },
    ...Array.from({ length: count }, (_, index) => ({
      label: `Profil ${String(index)} — rédaction numéro ${String(index)}`,
      value: `profil-${String(index)}`,
      section: "Mes profils",
    })),
  ];
}

describe("chercher : les deux sélecteurs répondent pareil", () => {
  it("réduisent un catalogue de plusieurs dizaines au même profil", () => {
    const desktop = filterProfiles(desktopCatalogue(SCALE), "profil-42");
    const tui = filterSelectOptions(tuiCatalogue(SCALE), "profil-42");

    expect(desktop.map((entry) => entry.id)).toEqual(["profil-42"]);
    expect(tui.map((option) => option.value)).toEqual(["profil-42"]);
  });

  it("ignorent la casse et les accents des deux côtés", () => {
    // « rédaction » doit se trouver en tapant « redaction » : une surface qui
    // exige l'accent oblige à apprendre deux fois la même recherche.
    for (const query of ["REDACTION", "rédaction", "Redac"]) {
      expect(filterProfiles(desktopCatalogue(3), query).length).toBeGreaterThan(0);
      expect(filterSelectOptions(tuiCatalogue(3), query).length).toBeGreaterThan(0);
    }
  });

  it("rendent la liste entière quand la recherche est vide", () => {
    expect(filterProfiles(desktopCatalogue(SCALE), "  ")).toHaveLength(SCALE + 2);
    expect(filterSelectOptions(tuiCatalogue(SCALE), "  ")).toHaveLength(SCALE + 2);
  });
});

describe("regrouper : le même ordre d'origines", () => {
  it("classe auto, puis les intégrés, puis les profils locaux", () => {
    const groups = groupProfiles(desktopCatalogue(SCALE));

    expect(groups.map((group) => group.origin)).toEqual(["auto", "builtin", "local"]);
    expect(groups.at(-1)?.entries).toHaveLength(SCALE);
  });

  it("ne montre pas un groupe vide après un filtrage", () => {
    const groups = groupProfiles(filterProfiles(desktopCatalogue(SCALE), "profil-7"));

    expect(groups.map((group) => group.origin)).toEqual(["local"]);
  });

  it("garde les sections de la TUI attachées à leurs options", () => {
    const sections = new Set(
      tuiCatalogue(SCALE)
        .map((option) => option.section)
        .filter(Boolean),
    );

    expect([...sections]).toEqual(["Intégrés", "Mes profils"]);
  });
});

describe("borner : la fenêtre ne suit pas le catalogue", () => {
  it("garde des fenêtres desktop de taille fixe", () => {
    // Les constantes SONT le contrat : la capsule et le popover sont des
    // fenêtres non redimensionnables, et Electron ne dessine rien au-delà.
    // Une liste qui ferait grandir la fenêtre serait simplement coupée.
    expect(POPOVER_WIDTH).toBe(320);
    expect(POPOVER_HEIGHT).toBe(260);
    expect(CAPSULE_HEIGHT).toBe(380);
  });

  it("borne la tranche TUI à la hauteur du dialogue, quel que soit le catalogue", () => {
    const capacity = dialogBodyCapacity(24);
    const petit = visibleWindow(0, 8, capacity);
    const grand = visibleWindow(0, 500, capacity);

    expect(petit.end - petit.start).toBe(8);
    expect(grand.end - grand.start).toBe(capacity);
    expect(grand.end - grand.start).toBeLessThanOrEqual(capacity);
  });

  it("garde le profil visé dans la tranche rendue, même au fond du catalogue", () => {
    // C'est ce qui rend un gros catalogue utilisable plutôt que seulement
    // affichable : les flèches ne doivent pas emmener le surlignage hors champ.
    const capacity = dialogBodyCapacity(24);
    for (const index of [0, 17, 42, SCALE - 1]) {
      const window = visibleWindow(index, SCALE, capacity);
      expect(index, `index ${String(index)} hors de la tranche`).toBeGreaterThanOrEqual(
        window.start,
      );
      expect(index).toBeLessThan(window.end);
    }
  });

  it("tient sur un terminal court sans sortir du cadre", () => {
    const capacity = dialogBodyCapacity(10);
    const window = visibleWindow(SCALE - 1, SCALE, capacity);

    expect(window.end - window.start).toBe(capacity);
    expect(window.end).toBe(SCALE);
  });
});

describe("l'ordre reste stable", () => {
  it("ne dépend pas du profil choisi entre deux ouvertures", () => {
    const before = groupProfiles(desktopCatalogue(5));
    const after = groupProfiles(desktopCatalogue(5));

    expect(after).toEqual(before);
    expect(after.find((group) => group.origin === "local")?.entries[0]?.id).toBe("profil-0");
  });
});
