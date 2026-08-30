import { describe, expect, it } from "vitest";
import { SCORE_VERSION, scoreCase, summarizeByProfile } from "../../benchmark/scoring.js";
import { compareByProfile, findVersionMismatch, parseRunFile } from "../../benchmark/compare.js";
import type { BenchmarkCase } from "../../benchmark/cases/dataset.js";

/**
 * Roadmap « Later — fidélité et qualité » : des métriques comparables selon le
 * profil et le modèle, sans quitter la machine.
 *
 * Deux critères sur cinq valaient 1 quoi qu'il arrive — `intention` et
 * `profile` — ce qui remontait chaque total de 0,4 et rendait deux modèles
 * indiscernables sur près de la moitié du score.
 */

function benchmarkCase(overrides: Partial<BenchmarkCase> = {}): BenchmarkCase {
  return {
    id: "cas",
    input: "corrige le formulaire de connexion sur mobile",
    profile: "frontend",
    requiredTerms: ["formulaire"],
    expectedIntent: "Corriger le formulaire.",
    ...overrides,
  };
}

describe("scoreCase", () => {
  it("ne contient plus aucun critère constant", () => {
    const bonne = scoreCase("Corrige le formulaire de connexion sur mobile.", benchmarkCase());
    const mauvaise = scoreCase("Refais toute la page d'accueil.", benchmarkCase());

    // Si un critère valait 1 des deux côtés, l'écart serait plafonné : c'est
    // exactement ce que faisaient `intention` et `profile`.
    expect(bonne.total).toBeGreaterThan(mauvaise.total);
    expect(mauvaise.intention).toBeLessThan(1);
  });

  it("mesure ce qui survit de l'intention", () => {
    expect(
      scoreCase("Corrige le formulaire de connexion sur mobile.", benchmarkCase()).intention,
    ).toBe(1);
    expect(scoreCase("Bonjour.", benchmarkCase()).intention).toBe(0);
  });

  it("compte comme invention un chemin que la demande ne contenait pas", () => {
    // Les mêmes détecteurs que le produit : ce que le benchmark mesure est ce
    // que l'utilisateur verra signalé, pas une seconde définition.
    const score = scoreCase("Corrige le formulaire dans src/auth/login.tsx.", benchmarkCase());

    expect(score.noInvention).toBe(0);
  });

  it("compte comme invention une commande ajoutée", () => {
    expect(
      scoreCase("Corrige le formulaire puis lance npm run build.", benchmarkCase()).noInvention,
    ).toBe(0);
  });

  it("reste à 1 quand la demande citait déjà le chemin", () => {
    const score = scoreCase(
      "Corrige le formulaire dans src/auth/login.tsx.",
      benchmarkCase({ input: "corrige le formulaire dans src/auth/login.tsx" }),
    );

    expect(score.noInvention).toBe(1);
  });
});

describe("summarizeByProfile", () => {
  it("sépare les profils au lieu de les compenser", () => {
    // Une moyenne unique cache le seul détail utile : un modèle peut exceller
    // sur un profil et s'effondrer sur un autre.
    const rows = summarizeByProfile([
      { profile: "code", score: scoreCase("Bonjour.", benchmarkCase()) },
      {
        profile: "writing",
        score: scoreCase("Corrige le formulaire de connexion sur mobile.", benchmarkCase()),
      },
    ]);

    expect(rows.map((row) => row.profile)).toEqual(["code", "writing"]);
    expect(rows[0]?.meanTotal).toBeLessThan(rows[1]?.meanTotal ?? 0);
    expect(rows[0]?.cases).toBe(1);
  });
});

describe("compareByProfile", () => {
  const row = (profile: string, meanTotal: number) => ({
    profile,
    cases: 1,
    meanTotal,
    meanTerms: meanTotal,
    meanIntention: meanTotal,
    meanNoInvention: meanTotal,
    meanClarity: meanTotal,
  });

  it("donne l'écart profil par profil", () => {
    const deltas = compareByProfile(
      [row("code", 0.5), row("writing", 0.9)],
      [row("code", 0.8), row("writing", 0.7)],
    );

    expect(deltas.map((entry) => entry.profile)).toEqual(["code", "writing"]);
    expect(deltas[0]).toMatchObject({ before: 0.5, after: 0.8 });
    expect(deltas[0]?.delta).toBeCloseTo(0.3, 5);
    expect(deltas[1]).toMatchObject({ before: 0.9, after: 0.7 });
    expect(deltas[1]?.delta).toBeCloseTo(-0.2, 5);
  });

  it("distingue « pas mesuré » de « mesuré à zéro »", () => {
    // Rendre 0 pour un profil absent ferait lire une régression là où il n'y a
    // qu'un cas manquant.
    const deltas = compareByProfile([], [row("code", 0.8)]);

    expect(deltas).toEqual([{ profile: "code", before: null, after: 0.8, delta: null }]);
  });
});

describe("findVersionMismatch", () => {
  const run = (scoreVersion?: number) => ({
    provider: "mock",
    model: "mock-model",
    timestamp: "",
    ...(scoreVersion === undefined ? {} : { scoreVersion }),
    aggregate: { meanTotal: 0.5 },
  });

  it("refuse de comparer deux règles de calcul différentes", () => {
    // L'écart mesurerait le changement de règles, pas celui des modèles.
    expect(findVersionMismatch(run(1), run(SCORE_VERSION))).toContain("règles");
  });

  it("laisse passer deux exécutions de la même version", () => {
    expect(findVersionMismatch(run(SCORE_VERSION), run(SCORE_VERSION))).toBeUndefined();
  });

  it("traite une exécution sans version comme la toute première", () => {
    expect(findVersionMismatch(run(), run())).toBeUndefined();
  });
});

describe("parseRunFile", () => {
  it("refuse un résultat d'un autre benchmark avec un message exploitable", () => {
    expect(() =>
      parseRunFile(
        {
          provider: "mock",
          model: "mock-model",
          timestamp: "2026-01-01T00:00:00.000Z",
          aggregate: { meanScore: 1 },
        },
        "fidelity.json",
      ),
    ).toThrow(/fidelity\.json.*aggregate\.meanTotal/);
  });
});
