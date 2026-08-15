import { describe, expect, it } from "vitest";
import {
  expansionGaugeModel,
  expansionRatio,
  expansionThreshold,
  formatRatio,
} from "../../src/ui/expansion-gauge.js";

describe("expansion gauge (CLI v2)", () => {
  const input = "fais moi un truc pour le site"; // 7 mots

  it("calcule le ratio en mots, arrondi affiché à une décimale", () => {
    const output = "un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze"; // 14 mots
    expect(expansionRatio(input, output)).toBeCloseTo(2, 5);
    expect(formatRatio(expansionRatio(input, output))).toBe("×2,0");
  });

  it("le seuil suit la politique du niveau (multiplicateur + marge structurelle)", () => {
    // standard : ×4 + 30 mots de marge → 4 + 30/7 ≈ 8,3 pour 7 mots
    expect(expansionThreshold(input, "standard")).toBeCloseTo(4 + 30 / 7, 5);
    // complete est plus permissif que minimal
    expect(expansionThreshold(input, "complete")).toBeGreaterThan(
      expansionThreshold(input, "minimal"),
    );
  });

  it("entrée vide : ratio neutre, seuil fini", () => {
    expect(expansionRatio("", "quelques mots ici")).toBe(1);
    expect(Number.isFinite(expansionThreshold("", "standard"))).toBe(true);
  });

  it("le modèle borne le remplissage à 100 % et marque le dépassement", () => {
    const huge = Array.from({ length: 200 }, () => "mot").join(" ");
    const model = expansionGaugeModel(input, huge, "minimal");
    expect(model.fillRatio).toBe(1);
    expect(model.exceeded).toBe(true);
    expect(model.thresholdPosition).toBeCloseTo(0.8, 5);
  });

  it("un résultat fidèle reste sous le seuil", () => {
    const output = "ajoute une section avis clients au site, responsive"; // 9 mots
    const model = expansionGaugeModel(input, output, "standard");
    expect(model.exceeded).toBe(false);
    expect(model.fillRatio).toBeLessThan(model.thresholdPosition);
  });
});
