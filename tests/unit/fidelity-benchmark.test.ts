import { describe, expect, it } from "vitest";
import { FIDELITY_BENCHMARK_CASES } from "../../benchmark/fidelity-cases.js";

/**
 * Ce que le corpus de fidélité doit garantir.
 *
 * Le seuil était un simple compte — « au moins 40 cas » — que dix-huit cas
 * générés à partir de cinq entrées répétées suffisaient à atteindre. Un compte
 * mesure la taille, pas la couverture : ce qu'on veut savoir, c'est que chaque
 * profil et chaque niveau sont représentés par de vraies demandes, et qu'aucune
 * n'apparaît deux fois.
 */

const TASK_PROFILES = ["clean", "code", "frontend", "web-design", "debug", "review", "writing"];
const MINIMUM_PER_PROFILE = 4;

describe("corpus de fidélité", () => {
  it("donne à chaque profil de quoi détecter une régression", () => {
    for (const profile of TASK_PROFILES) {
      const cases = FIDELITY_BENCHMARK_CASES.filter((entry) => entry.profile === profile);
      expect(cases.length, `${profile} n'a que ${String(cases.length)} cas`).toBeGreaterThanOrEqual(
        MINIMUM_PER_PROFILE,
      );
    }
  });

  it("couvre les trois niveaux de réécriture", () => {
    // L'expansion tolérée dépend du niveau : un corpus qui n'en teste qu'un ne
    // dit rien des deux autres.
    const levels = new Set(FIDELITY_BENCHMARK_CASES.map((entry) => entry.level));

    expect([...levels].sort((a, b) => a.localeCompare(b))).toEqual([
      "complete",
      "minimal",
      "standard",
    ]);
  });

  it("ne répète pas la même demande", () => {
    // Dix-huit cas bâtis sur cinq phrases coûtaient dix-huit appels au modèle
    // pour la couverture de cinq.
    const inputs = FIDELITY_BENCHMARK_CASES.map((entry) => entry.input.trim().toLowerCase());
    const duplicated = inputs.filter((input, index) => inputs.indexOf(input) !== index);

    // Une même demande à deux niveaux différents est légitime : c'est le
    // niveau qu'on compare. Au-delà, c'est du remplissage.
    for (const input of new Set(duplicated)) {
      const sameInput = FIDELITY_BENCHMARK_CASES.filter(
        (entry) => entry.input.trim().toLowerCase() === input,
      );
      const levels = new Set(sameInput.map((entry) => entry.level));
      expect(levels.size, `« ${input} » est répétée au même niveau`).toBe(sameInput.length);
    }
  });

  it("donne un identifiant unique à chaque cas", () => {
    const ids = FIDELITY_BENCHMARK_CASES.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nomme ce qui ne doit pas apparaître, pour chaque cas", () => {
    for (const testCase of FIDELITY_BENCHMARK_CASES) {
      expect(testCase.forbiddenAdditions.length, testCase.id).toBeGreaterThan(0);
    }
  });
});
