import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProfileCatalog, getProfileOrigin } from "@/profiles/catalog.js";
import { getProfile, listProfiles } from "@/profiles/registry.js";
import { PROFILE_FILE_EXTENSION } from "@/profiles/local-store.js";
import { runProfilesEdit, runProfilesRemove } from "@/apps/cli/commands/profiles.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

/**
 * Roadmap « Later — contexte par projet », second volet : des profils
 * versionnables avec le dépôt, dans `.reqraft/profiles/`.
 *
 * La règle tient en une phrase : un profil de projet ne peut pas prendre
 * l'identifiant d'un intégré, il l'emporte sur un profil personnel du même
 * identifiant, et le profil recouvert est signalé plutôt qu'effacé.
 */

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
  // Le catalogue est un état de module : le remettre à vide évite qu'un test
  // hérite des profils du précédent.
  await loadProfileCatalog({ profilesDir: undefined, projectProfilesDir: null });
});

async function profileDirectory(profiles: Record<string, unknown>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "reqraft-profils-"));
  directories.push(directory);
  for (const [id, body] of Object.entries(profiles)) {
    await writeFile(
      path.join(directory, `${id}${PROFILE_FILE_EXTENSION}`),
      JSON.stringify(body),
      "utf8",
    );
  }
  return directory;
}

function profile(id: string, name: string) {
  return {
    schemaVersion: 1,
    id,
    name,
    description: `Profil ${name}`,
    defaultLevel: "standard",
    instructions: `Instructions de ${name}.`,
  };
}

describe("profils portés par le projet", () => {
  it("charge `.reqraft/profiles` et les rend résolvables", async () => {
    const projectDir = await profileDirectory({ "revue-equipe": profile("revue-equipe", "Revue") });

    const catalog = await loadProfileCatalog({
      profilesDir: await profileDirectory({}),
      projectProfilesDir: projectDir,
    });

    expect(catalog.project.map((entry) => entry.id)).toEqual(["revue-equipe"]);
    expect(getProfile("revue-equipe")?.name).toBe("Revue");
    expect(getProfileOrigin("revue-equipe")).toBe("project");
  });

  it("passe avant les profils personnels dans la liste", async () => {
    // Dans un dépôt qui en fournit, ce sont eux la convention : un sélecteur
    // qui les enterre sous les profils personnels rate le sujet.
    const catalog = await loadProfileCatalog({
      profilesDir: await profileDirectory({ perso: profile("perso", "Perso") }),
      projectProfilesDir: await profileDirectory({ equipe: profile("equipe", "Équipe") }),
    });

    expect(catalog.project).toHaveLength(1);
    const ids = listProfiles().map((entry) => entry.id);
    expect(ids.indexOf("equipe")).toBeLessThan(ids.indexOf("perso"));
  });

  it("l'emporte sur un profil personnel du même identifiant, et le dit", async () => {
    const catalog = await loadProfileCatalog({
      profilesDir: await profileDirectory({ sav: profile("sav", "SAV perso") }),
      projectProfilesDir: await profileDirectory({ sav: profile("sav", "SAV équipe") }),
    });

    expect(getProfile("sav")?.name).toBe("SAV équipe");
    // Une seule entrée pour un identifiant : un sélecteur qui en montrerait
    // deux ne saurait pas laquelle est choisie.
    expect(listProfiles().filter((entry) => entry.id === "sav")).toHaveLength(1);
    // Et le profil recouvert est signalé, pas effacé en silence — sinon on
    // verrait son propre profil cesser d'agir sans explication.
    const shadowed = catalog.problems.filter((problem) => problem.kind === "shadowed");
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0]?.id).toBe("sav");
  });

  it("ne peut pas prendre l'identifiant d'un profil intégré", async () => {
    const catalog = await loadProfileCatalog({
      profilesDir: await profileDirectory({}),
      projectProfilesDir: await profileDirectory({ clean: profile("clean", "Détourné") }),
    });

    expect(catalog.project).toEqual([]);
    expect(getProfileOrigin("clean")).toBe("builtin");
    expect(catalog.problems.some((problem) => problem.kind === "invalid")).toBe(true);
  });

  it("se désactive explicitement quand aucun projet n'est en jeu", async () => {
    const catalog = await loadProfileCatalog({
      profilesDir: await profileDirectory({ perso: profile("perso", "Perso") }),
      projectProfilesDir: null,
    });

    expect(catalog.project).toEqual([]);
    expect(catalog.local.map((entry) => entry.id)).toEqual(["perso"]);
  });

  it("signale un dossier de profils projet illisible au lieu de l'ignorer", async () => {
    const catalog = await loadProfileCatalog({
      profilesDir: await profileDirectory({}),
      // Un chemin qui n'existe pas se comporte comme un dossier vide ; c'est un
      // FICHIER passé pour un dossier qui doit être signalé.
      projectProfilesDir: path.join(await profileDirectory({}), "pas-un-dossier"),
    });

    expect(catalog.project).toEqual([]);
  });
});

describe("un profil de projet ne se modifie pas depuis l'application", () => {
  it("est refusé à l'édition et à la suppression, avec la bonne raison", async () => {
    await mkdir(path.join(await profileDirectory({}), "vide"), { recursive: true });
    await loadProfileCatalog({
      profilesDir: await profileDirectory({}),
      projectProfilesDir: await profileDirectory({ equipe: profile("equipe", "Équipe") }),
    });

    // `getProfileOrigin` est ce que les deux surfaces interrogent pour refuser :
    // le CLI comme le desktop. Sans cette réponse, une modification irait
    // écrire dans le dépôt de toute l'équipe.
    expect(getProfileOrigin("equipe")).toBe("project");
  });
});

describe("les surfaces refusent d'écrire dans le dépôt", () => {
  it("le CLI refuse de modifier un profil de projet, et dit où aller", async () => {
    const userDir = await profileDirectory({});
    await loadProfileCatalog({
      profilesDir: userDir,
      projectProfilesDir: await profileDirectory({ equipe: profile("equipe", "Équipe") }),
    });

    const errors: string[] = [];
    const exitCode = await runProfilesEdit("equipe", {
      interactive: true,
      ask: () => Promise.resolve(""),
      output: { log: () => undefined, error: (message: string) => errors.push(message) },
      profilesDir: userDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    // Le message doit envoyer au dépôt, pas parler de profil intégré : les deux
    // refus se corrigent à des endroits différents.
    expect(errors.join("\n")).toContain(".reqraft/profiles");
  });

  it("le CLI refuse de supprimer un profil de projet", async () => {
    const userDir = await profileDirectory({});
    await loadProfileCatalog({
      profilesDir: userDir,
      projectProfilesDir: await profileDirectory({ equipe: profile("equipe", "Équipe") }),
    });

    const errors: string[] = [];
    const exitCode = await runProfilesRemove("equipe", {
      output: { log: () => undefined, error: (message: string) => errors.push(message) },
      profilesDir: userDir,
      confirm: () => Promise.resolve("o"),
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.join("\n")).toContain(".reqraft/profiles");
  });
});
