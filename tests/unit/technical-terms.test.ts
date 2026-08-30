import { describe, expect, it } from "vitest";
import { assessFidelity } from "@/core/fidelity.js";
import { detectMissingTechnicalTerms, extractTechnicalTerms } from "@/core/technical-terms.js";
import { BENCHMARK_DATASET } from "../../benchmark/cases/dataset.js";

describe("termes techniques", () => {
  it("extrait les littéraux vérifiables fournis par la demande", () => {
    const terms = extractTechnicalTerms(
      "Corrige `parseResult` dans src/core/result.ts avec --dry-run et API_KEY " +
        "pour https://example.com/v1 en v1.2.3.",
    );

    expect(terms).toEqual(
      expect.arrayContaining([
        "--dry-run",
        "API_KEY",
        "parseResult",
        "src/core/result.ts",
        "https://example.com/v1",
        "v1.2.3",
      ]),
    );
  });

  it("sépare la méthode HTTP et la route afin d'accepter leur reformulation", () => {
    expect(extractTechnicalTerms("crée un endpoint GET /health")).toEqual(["/health", "GET"]);
    expect(
      detectMissingTechnicalTerms(
        "crée un endpoint GET /health",
        "Ajoute la route `/health` qui répond à la méthode GET.",
      ),
    ).toEqual([]);
  });

  it("repère les termes perdus sans confondre une sous-chaîne", () => {
    expect(
      detectMissingTechnicalTerms(
        "garde GET /health et parseResult",
        "Respecte le budget et garde `/health`.",
      ),
    ).toEqual(["GET", "parseResult"]);
  });

  it("ignore la casse et reste silencieux sur de la prose ordinaire", () => {
    expect(detectMissingTechnicalTerms("garde `ParseResult`", "Conserve parseresult.")).toEqual([]);
    expect(extractTechnicalTerms("rends ce message plus poli sans changer son intention")).toEqual(
      [],
    );
  });

  it("ne produit aucun faux positif quand une demande du corpus est recopiée", () => {
    const noisy = BENCHMARK_DATASET.flatMap((entry) => {
      const missing = detectMissingTechnicalTerms(entry.input, `[mock] ${entry.input}`);
      return missing.length === 0 ? [] : [`${entry.id}: ${missing.join(", ")}`];
    });

    expect(noisy, noisy.join("\n")).toEqual([]);
  });
});

describe("signal de fidélité", () => {
  it("nomme les termes techniques absents et demande une revue", () => {
    const quality = assessFidelity(
      "corrige parseResult dans src/core/result.ts",
      "Corrige la fonction de parsing.",
      "balanced",
      "standard",
    );

    expect(quality.signals).toContainEqual({
      code: "missing_technical_terms",
      severity: "warning",
      params: { terms: ["parseResult", "src/core/result.ts"] },
    });
    expect(quality.status).toBe("review");
  });

  it("reste informatif en mode permissif", () => {
    const quality = assessFidelity(
      "utilise `API_KEY`",
      "utilise la variable",
      "permissive",
      "minimal",
    );

    expect(quality.signals.find(({ code }) => code === "missing_technical_terms")?.severity).toBe(
      "info",
    );
    expect(quality.status).toBe("good");
  });
});
