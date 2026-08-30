import { describe, expect, it } from "vitest";
import path from "node:path";
import { findProjectContext } from "@/config/project.js";

/**
 * Le dépôt Reqraft ne doit pas se comporter comme un projet Reqraft.
 *
 * `loadConfig()` et `loadProfileCatalog()` remontent depuis le dossier courant
 * pour trouver `.reqraft/` — c'est la fonctionnalité. Mais la suite de tests
 * s'exécute DANS ce dépôt : le jour où quelqu'un y ajoute un `.reqraft/` pour
 * se donner des conventions, une douzaine de tests changeraient de
 * comportement, et rien ne dirait pourquoi.
 *
 * Ce test-ci échoue à la place, avec la marche à suivre.
 */
describe("hermétisme de la suite de tests", () => {
  it("ne trouve aucun projet Reqraft en remontant depuis le dépôt", () => {
    const context = findProjectContext(process.cwd());
    const repository = path.resolve(".");

    expect(
      context?.root,
      "Le dépôt (ou un de ses parents) porte maintenant un `.reqraft/`.\n" +
        "Les tests qui appellent `loadProfileCatalog({ profilesDir })` ou\n" +
        "`loadConfig()` vont en hériter. Passez-leur `projectProfilesDir: null`\n" +
        "et `loadConfig(null)` pour les rendre hermétiques.",
    ).not.toBe(repository);
  });
});
