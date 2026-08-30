import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { ConfigSchema, type Config } from "./schema.js";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

/**
 * Configuration portée par un projet, versionnable avec le dépôt.
 *
 * Deux projets doivent pouvoir appliquer des conventions différentes — un
 * profil par défaut, un niveau, une langue de sortie — sans que chaque personne
 * ait à reconfigurer sa machine en changeant de dossier. Le fichier vit dans
 * `.reqraft/`, à la racine du projet, et se trouve en remontant depuis le
 * dossier courant, comme `.git` ou `.eslintrc`.
 *
 * Priorité : options de la ligne de commande, puis ce fichier, puis la
 * configuration utilisateur, puis les valeurs par défaut. Le fichier projet ne
 * remplace jamais la configuration utilisateur : il la recouvre, clé par clé,
 * et seulement pour les clés qu'il déclare.
 */

export const PROJECT_DIRECTORY = ".reqraft";
export const PROJECT_CONFIG_FILE = "config.json";
export const PROJECT_PROFILES_DIRECTORY = "profiles";

/**
 * Ce qu'un fichier de projet n'a pas le droit de décider.
 *
 * Tout ce qui choisit un fournisseur, un coût, une destination réseau, un
 * comportement machine ou une préférence d'interface appartient à la personne,
 * pas au dépôt. L'allowlist ci-dessous reste volontairement plus courte que la
 * liste : une future clé de configuration sera refusée jusqu'à une décision
 * explicite sur sa portée.
 */
export const PERSONAL_CONFIG_KEYS = [
  "defaultProvider",
  "defaultModel",
  "copyAfterGeneration",
  "stream",
  "timeoutMs",
  "maxOutputTokens",
  "showChanges",
  "showStats",
  "telemetry",
  "uiLocale",
  "providers",
  "desktopShortcuts",
] as const;

/**
 * Le sous-ensemble de la configuration qu'un projet peut fixer.
 *
 * `strict()` et non `passthrough()`, à l'inverse du schéma utilisateur : une clé
 * inconnue dans un fichier versionné est probablement une erreur — au pire une
 * clé d'API écrite à la main — et l'ignorer en silence serait le pire des deux
 * comportements possibles.
 */
export const ProjectConfigSchema = ConfigSchema.pick({
  defaultProfile: true,
  defaultLevel: true,
  fidelityMode: true,
  outputLanguage: true,
})
  .partial()
  .strict();

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export interface ProjectContext {
  /** Le dossier qui contient `.reqraft/`. */
  root: string;
  directory: string;
  configPath: string;
  profilesDirectory: string;
}

/**
 * Le projet auquel appartient un dossier, ou rien.
 *
 * Remonte jusqu'à la racine du système de fichiers. Le premier `.reqraft/`
 * rencontré gagne : un dépôt imbriqué décide pour lui-même, ce qui est la
 * seule règle qui ne demande pas de deviner l'intention.
 */
export function findProjectContext(startDirectory: string = process.cwd()): ProjectContext | null {
  let current = path.resolve(startDirectory);

  for (;;) {
    const directory = path.join(current, PROJECT_DIRECTORY);
    if (existsSync(directory)) {
      return {
        root: current,
        directory,
        configPath: path.join(directory, PROJECT_CONFIG_FILE),
        profilesDirectory: path.join(directory, PROJECT_PROFILES_DIRECTORY),
      };
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Lit la configuration du projet, ou rien s'il n'y en a pas.
 *
 * Un fichier illisible ou refusé n'est jamais ignoré : il arrête la commande
 * avec le chemin fautif. Un fichier versionné qui ne s'applique pas en silence
 * ferait diverger deux machines sans que personne ne s'en aperçoive.
 */
export async function loadProjectConfig(
  startDirectory: string = process.cwd(),
): Promise<{ context: ProjectContext; values: ProjectConfig } | null> {
  const context = findProjectContext(startDirectory);
  if (context === null || !existsSync(context.configPath)) return null;

  try {
    const content = await readFile(context.configPath, "utf8");
    return { context, values: ProjectConfigSchema.parse(JSON.parse(content) as unknown) };
  } catch (error) {
    throw new ReqraftError("config.invalid", EXIT_CODES.INVALID_CONFIGURATION, {
      params: { path: context.configPath },
      cause: error,
    });
  }
}

/**
 * Recouvre la configuration utilisateur avec celle du projet.
 *
 * Clé par clé : ce que le projet ne déclare pas reste tel quel. Le schéma projet
 * est une allowlist étroite, donc aucune préférence personnelle ni aucun
 * endpoint ne peut entrer dans cette fusion.
 */
export function mergeProjectConfig(user: Config, project: ProjectConfig | null): Config {
  if (project === null) return user;

  return ConfigSchema.parse({
    ...user,
    ...project,
  });
}
