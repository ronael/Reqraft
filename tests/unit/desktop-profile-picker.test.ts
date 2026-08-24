import { describe, expect, it } from "vitest";
import { filterProfiles, groupProfiles } from "@/apps/desktop/renderer/shared/profiles.js";
import type { ProfileCatalogEntry } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Picking a profile from a catalogue that grows.
 *
 * The popover used to lay every profile out as a chip: eight already wrapped
 * onto three lines inside a panel that cannot grow. Search and grouping are
 * what replace that, so they are what has to hold.
 */

function entry(
  id: string,
  origin: ProfileCatalogEntry["origin"],
  description = "",
): ProfileCatalogEntry {
  return { id, name: id, description, origin };
}

const CATALOG: ProfileCatalogEntry[] = [
  entry("auto", "auto", "Détection automatique."),
  entry("clean", "builtin", "Nettoyage de la forme."),
  entry("code", "builtin", "Demandes techniques."),
  entry("writing", "builtin", "Rédaction."),
  entry("review-strict", "local", "Revue sévère."),
  entry("wordpress", "local", "Sites WordPress."),
];

describe("filterProfiles", () => {
  it("rend tout le catalogue sans recherche", () => {
    expect(filterProfiles(CATALOG, "")).toHaveLength(CATALOG.length);
    expect(filterProfiles(CATALOG, "   ")).toHaveLength(CATALOG.length);
  });

  it("cherche dans l'identifiant", () => {
    expect(filterProfiles(CATALOG, "word").map((e) => e.id)).toEqual(["wordpress"]);
  });

  it("cherche aussi dans la description", () => {
    // Someone remembers what a profile does, not what they called it.
    expect(filterProfiles(CATALOG, "technique").map((e) => e.id)).toEqual(["code"]);
  });

  it("ignore la casse et les accents", () => {
    // "rédaction" has to be reachable by typing "redaction".
    expect(filterProfiles(CATALOG, "REDACTION").map((e) => e.id)).toEqual(["writing"]);
    expect(filterProfiles(CATALOG, "détection").map((e) => e.id)).toEqual(["auto"]);
  });

  it("ne rend rien quand rien ne correspond", () => {
    expect(filterProfiles(CATALOG, "zzz")).toEqual([]);
  });
});

describe("groupProfiles", () => {
  it("range dans un ordre fixe : auto, intégrés, puis les siens", () => {
    expect(groupProfiles(CATALOG).map((group) => group.origin)).toEqual([
      "auto",
      "builtin",
      "local",
    ]);
  });

  it("nomme le groupe local par ce qu'il est pour l'utilisateur", () => {
    expect(groupProfiles(CATALOG).find((g) => g.origin === "local")?.label).toBe("Mes profils");
  });

  it("laisse tomber un groupe vide", () => {
    // A filtered list must never show a heading with nothing under it.
    const groups = groupProfiles(filterProfiles(CATALOG, "word"));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.origin).toBe("local");
  });

  it("garde chaque profil exactement une fois", () => {
    const flattened = groupProfiles(CATALOG).flatMap((group) => group.entries);

    expect(flattened).toHaveLength(CATALOG.length);
    expect(new Set(flattened.map((e) => e.id)).size).toBe(CATALOG.length);
  });

  it("tient un gros catalogue sans rien perdre", () => {
    // The point of the whole change: the panel is bounded, the data is not.
    const many = Array.from({ length: 120 }, (_, index) =>
      entry(`profil-${String(index)}`, "local"),
    );
    const groups = groupProfiles(many);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries).toHaveLength(120);
    expect(filterProfiles(many, "profil-119").map((e) => e.id)).toEqual(["profil-119"]);
  });
});
