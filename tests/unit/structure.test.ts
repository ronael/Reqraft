import { describe, expect, it } from "vitest";
import { countStructure, isStructurallyInflated } from "@/core/structure.js";
import { assessFidelity } from "@/core/fidelity.js";
import { BENCHMARK_DATASET } from "../../benchmark/cases/dataset.js";

/**
 * Roadmap « Later — fidélité et qualité », ajout de scope.
 *
 * L'expansion se compte en mots et rate un cas précis : une phrase qui devient
 * un cahier des charges à six puces sans beaucoup grossir. C'est un changement
 * de nature, pas de taille — et il se compte, donc il se vérifie, à la
 * différence d'une liste de termes à maintenir.
 */

describe("countStructure", () => {
  it("compte les puces, quel que soit le marqueur", () => {
    expect(countStructure("- un\n* deux\n+ trois\n• quatre").listItems).toBe(4);
  });

  it("compte les listes numérotées", () => {
    expect(countStructure("1. un\n2) deux").listItems).toBe(2);
  });

  it("compte les titres à part des puces", () => {
    expect(countStructure("# Titre\n## Sous-titre\n- une puce")).toEqual({
      headings: 2,
      listItems: 1,
    });
  });

  it("ne prend pas un tiret de phrase pour une puce", () => {
    // « demain — peux-tu confirmer » n'ouvre pas une liste.
    expect(countStructure("Faisons le point demain — peux-tu confirmer ?").listItems).toBe(0);
  });

  it("ne prend pas un nombre en début de phrase pour une liste", () => {
    expect(countStructure("2026 sera différent.").listItems).toBe(0);
  });
});

describe("isStructurallyInflated", () => {
  const plan = "# Objectif\n- un\n- deux\n- trois\n- quatre\n- cinq\n- six";

  it("refuse toute structure ajoutée au niveau minimal", () => {
    // « corrige les fautes, ne change rien d'autre » ne doit pas revenir en
    // plan.
    expect(isStructurallyInflated("corrige les fautes", "- corrige les fautes", "minimal")).toBe(
      true,
    );
  });

  it("laisse le niveau complet détailler", () => {
    expect(isStructurallyInflated("fais une landing page", plan, "complete")).toBe(false);
  });

  it("signale un plan là où le niveau standard attend une reformulation", () => {
    expect(isStructurallyInflated("ajoute un bouton rouge", plan, "standard")).toBe(true);
  });

  it("ne compte que ce qui a été AJOUTÉ", () => {
    // Une demande déjà écrite en liste peut ressortir en liste : rien n'a été
    // inventé, et la signaler apprendrait à ignorer le signal.
    const liste = "- un\n- deux\n- trois";
    expect(isStructurallyInflated(liste, liste, "minimal")).toBe(false);
  });
});

describe("le signal remonte, et se tait sur le corpus", () => {
  it("avertit quand une demande revient en plan", () => {
    const quality = assessFidelity(
      "corrige les fautes de ce paragraphe",
      "# Corrections\n- orthographe\n- grammaire\n- ponctuation",
      "balanced",
      "minimal",
    );

    expect(quality.signals.map((signal) => signal.code)).toContain("structural_inflation");
  });

  it("ne dit rien quand la sortie reprend la demande", () => {
    const noisy = BENCHMARK_DATASET.filter((benchmarkCase) =>
      isStructurallyInflated(benchmarkCase.input, `[mock] ${benchmarkCase.input}`, "minimal"),
    ).map((benchmarkCase) => benchmarkCase.id);

    expect(noisy, noisy.join(", ")).toEqual([]);
  });
});
