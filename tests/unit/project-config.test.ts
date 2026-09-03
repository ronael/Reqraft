import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PERSONAL_CONFIG_KEYS,
  ProjectConfigSchema,
  findProjectContext,
  loadProjectConfig,
  mergeProjectConfig,
} from "@/config/project.js";
import { ConfigSchema, type Config } from "@/config/schema.js";

/**
 * Roadmap « Later — contexte par projet ».
 *
 * Deux projets doivent pouvoir appliquer des conventions différentes tout en
 * gardant les réglages personnels comme repli — et le fichier étant versionné,
 * il ne doit jamais pouvoir porter un secret ni décider à la place de la
 * personne.
 */

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createProject(values?: unknown, depth = 0): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "reqraft-project-"));
  directories.push(root);
  await mkdir(path.join(root, ".reqraft"), { recursive: true });
  if (values !== undefined) {
    await writeFile(path.join(root, ".reqraft", "config.json"), JSON.stringify(values), "utf8");
  }
  if (depth === 0) return root;

  const nested = path.join(root, ...Array.from({ length: depth }, (_, i) => `sous-${String(i)}`));
  await mkdir(nested, { recursive: true });
  return nested;
}

const USER: Config = ConfigSchema.parse({
  defaultProvider: "openai",
  defaultModel: "gpt-5-mini",
  defaultProfile: "writing",
  defaultLevel: "standard",
  uiLocale: "fr",
});

describe("trouver le projet", () => {
  it("remonte depuis un sous-dossier jusqu'au dossier qui porte `.reqraft`", async () => {
    const deep = await createProject({ defaultProfile: "code" }, 3);
    const context = findProjectContext(deep);

    expect(context).not.toBeNull();
    expect(context?.configPath).toMatch(/\.reqraft\/config\.json$/);
    expect(deep.startsWith(context?.root ?? "///")).toBe(true);
  });

  it("ne trouve rien hors d'un projet", async () => {
    const orphan = await mkdtemp(path.join(tmpdir(), "reqraft-orphan-"));
    directories.push(orphan);

    // `/` ou `/tmp` pourraient porter un `.reqraft` sur la machine de
    // quelqu'un ; ce qui est vérifié, c'est qu'aucun n'est inventé ici.
    const context = findProjectContext(orphan);
    expect(context?.root).not.toBe(orphan);
  });

  it("rend un projet sans fichier de configuration comme sans configuration", async () => {
    const root = await createProject();

    expect(findProjectContext(root)).not.toBeNull();
    expect(await loadProjectConfig(root)).toBeNull();
  });
});

describe("ce qu'un projet n'a pas le droit d'écrire", () => {
  it("refuse tout fournisseur, endpoint et variable d'environnement", () => {
    expect(() => ProjectConfigSchema.parse({ defaultProvider: "openai-compatible" })).toThrow();
    expect(() =>
      ProjectConfigSchema.parse({
        providers: {
          local: {
            type: "openai-compatible",
            baseUrl: "https://attacker.example/v1",
            apiKeyEnv: "GITHUB_TOKEN",
          },
        },
      }),
    ).toThrow();
  });

  it("refuse une clé inconnue plutôt que de l'ignorer", () => {
    // Le schéma utilisateur laisse passer l'inconnu ; dans un fichier versionné
    // une clé inattendue est au mieux une faute de frappe, au pire une clé
    // d'API écrite à la main. L'ignorer serait le pire des deux comportements.
    expect(() => ProjectConfigSchema.parse({ apiKey: "sk-secret" })).toThrow();
    expect(() => ProjectConfigSchema.parse({ defaultPrafile: "code" })).toThrow();
  });

  it("refuse ce qui appartient à la personne, pas au dépôt", () => {
    for (const key of PERSONAL_CONFIG_KEYS) {
      const values: Record<string, unknown> = {
        telemetry: true,
        uiLocale: "fr",
        desktopShortcuts: { capture: "F1" },
      };
      expect(() => ProjectConfigSchema.parse({ [key]: values[key] }), key).toThrow();
    }
  });

  it("accepte les conventions qui font l'intérêt de la fonctionnalité", () => {
    const values = ProjectConfigSchema.parse({
      defaultProfile: "code",
      defaultLevel: "complete",
      outputLanguage: "en",
      fidelityMode: "strict",
    });

    expect(values).toEqual({
      defaultProfile: "code",
      defaultLevel: "complete",
      outputLanguage: "en",
      fidelityMode: "strict",
    });
  });

  it("arrête la commande sur un fichier illisible au lieu de l'ignorer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "reqraft-project-"));
    directories.push(root);
    await mkdir(path.join(root, ".reqraft"), { recursive: true });
    await writeFile(path.join(root, ".reqraft", "config.json"), "{ pas du json", "utf8");

    // Un fichier versionné qui ne s'applique pas en silence ferait diverger
    // deux machines sans que personne ne s'en aperçoive.
    await expect(loadProjectConfig(root)).rejects.toThrow();
  });
});

describe("recouvrir, pas remplacer", () => {
  it("ne touche pas aux clés que le projet ne déclare pas", () => {
    const merged = mergeProjectConfig(USER, { defaultProfile: "code" });

    expect(merged.defaultProfile).toBe("code");
    expect(merged.defaultProvider).toBe("openai");
    expect(merged.defaultModel).toBe("gpt-5-mini");
    expect(merged.uiLocale).toBe("fr");
  });

  it("rend la configuration utilisateur telle quelle hors d'un projet", () => {
    expect(mergeProjectConfig(USER, null)).toBe(USER);
  });

  it("conserve le fournisseur personnel intact", () => {
    const user = ConfigSchema.parse({
      ...USER,
      providers: { perso: { type: "openai-compatible", baseUrl: "https://perso/v1" } },
    });
    const merged = mergeProjectConfig(user, { defaultProfile: "code" });

    expect(merged.providers).toEqual(user.providers);
  });
});

describe("la chaîne complète, sur disque", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  /** Le fichier utilisateur, là où la plateforme le range vraiment. */
  async function writeUserConfig(home: string, values: unknown): Promise<void> {
    const directory =
      process.platform === "darwin"
        ? path.join(home, "Library", "Application Support", "rp")
        : path.join(home, ".config", "rp");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "config.json"), JSON.stringify(values), "utf8");
  }

  it("recouvre la configuration utilisateur par celle du projet", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "reqraft-home-"));
    directories.push(home);
    await writeUserConfig(home, {
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
      defaultProfile: "writing",
      defaultLevel: "minimal",
      uiLocale: "fr",
    });
    const project = await createProject({ defaultProfile: "code", defaultLevel: "complete" });

    process.env.HOME = home;
    const { loadConfig, loadUserConfig } = await import("@/config/loader.js");

    const effective = await loadConfig(project);
    expect(effective.defaultProfile).toBe("code");
    expect(effective.defaultLevel).toBe("complete");
    // Ce que le projet ne dit pas reste celui de la personne.
    expect(effective.defaultModel).toBe("gpt-5-mini");
    expect(effective.uiLocale).toBe("fr");

    // Et le fichier personnel n'a pas bougé : c'est lui qu'on modifie.
    const user = await loadUserConfig();
    expect(user.defaultProfile).toBe("writing");
    expect(user.defaultLevel).toBe("minimal");
  });

  it("rend la configuration utilisateur intacte hors de tout projet", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "reqraft-home-"));
    const elsewhere = await mkdtemp(path.join(tmpdir(), "reqraft-ailleurs-"));
    directories.push(home, elsewhere);
    await writeUserConfig(home, { defaultProfile: "writing" });

    process.env.HOME = home;
    const { loadConfig } = await import("@/config/loader.js");

    expect((await loadConfig(elsewhere)).defaultProfile).toBe("writing");
  });
});
