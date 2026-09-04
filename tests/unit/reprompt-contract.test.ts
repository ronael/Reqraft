import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIDELITY_MODE_ID,
  DEFAULT_REPROMPT_LEVEL_ID,
  FIDELITY_MODE_IDS,
  REPROMPT_LEVEL_IDS,
} from "@/shared/reprompt-contract.js";
import { DEFAULT_REPROMPT_LEVEL, REPROMPT_LEVELS, RepromptLevelSchema } from "@/core/levels.js";
import { DEFAULT_FIDELITY_MODE, FIDELITY_MODES } from "@/core/types.js";
import {
  FIDELITY_MODE_IDS as IPC_FIDELITY_MODE_IDS,
  REPROMPT_LEVEL_IDS as IPC_REPROMPT_LEVEL_IDS,
} from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Les niveaux et les modes de fidélité existaient en deux exemplaires : le
 * cœur les déclarait, le contrat IPC les recopiait parce que le renderer ne
 * peut pas importer le cœur, et deux tests comparaient les deux listes. Ces
 * tests de dérive n'ont plus d'objet — il n'y a plus qu'une liste.
 *
 * Ce qui les remplace est un test de contrat : les valeurs elles-mêmes, dans
 * leur ordre, et le fait que le cœur comme l'IPC lisent bien le même module.
 * Une valeur ajoutée ou renommée casse ici, là où la décision se prend.
 */

describe("contrat des niveaux de reprompting", () => {
  it("fixe les valeurs et leur ordre", () => {
    expect([...REPROMPT_LEVEL_IDS]).toEqual(["minimal", "standard", "complete"]);
    expect(DEFAULT_REPROMPT_LEVEL_ID).toBe("standard");
  });

  it("est la seule source du cœur", () => {
    expect(REPROMPT_LEVELS).toBe(REPROMPT_LEVEL_IDS);
    expect(DEFAULT_REPROMPT_LEVEL).toBe(DEFAULT_REPROMPT_LEVEL_ID);
  });

  it("est la seule source du contrat IPC lu par le renderer", () => {
    expect(IPC_REPROMPT_LEVEL_IDS).toBe(REPROMPT_LEVEL_IDS);
  });

  it("produit un schéma Zod qui n'accepte que ces valeurs", () => {
    expect(RepromptLevelSchema.options).toEqual([...REPROMPT_LEVEL_IDS]);
    for (const level of REPROMPT_LEVEL_IDS) {
      expect(RepromptLevelSchema.safeParse(level).success).toBe(true);
    }
    expect(RepromptLevelSchema.safeParse("moyen").success).toBe(false);
  });
});

describe("contrat des modes de fidélité", () => {
  it("fixe les valeurs et leur ordre", () => {
    expect([...FIDELITY_MODE_IDS]).toEqual(["permissive", "balanced", "strict"]);
    expect(DEFAULT_FIDELITY_MODE_ID).toBe("balanced");
  });

  it("est la seule source du cœur", () => {
    expect(FIDELITY_MODES).toBe(FIDELITY_MODE_IDS);
    expect(DEFAULT_FIDELITY_MODE).toBe(DEFAULT_FIDELITY_MODE_ID);
  });

  it("est la seule source du contrat IPC lu par le renderer", () => {
    expect(IPC_FIDELITY_MODE_IDS).toBe(FIDELITY_MODE_IDS);
  });
});
