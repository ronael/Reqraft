import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ConfigSchema, type Config } from "./schema.js";
import { getConfigPath } from "./paths.js";
import { ReqraftError } from "@/core/errors.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { writeAtomicFile } from "@/utils/atomic-write.js";
import { loadProjectConfig, mergeProjectConfig } from "./project.js";

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

/**
 * La configuration de la personne, seule.
 *
 * C'est celle qu'on modifie : tout ce qui écrit doit partir d'ici, jamais de la
 * configuration effective — recopier les valeurs d'un projet dans le fichier
 * utilisateur les rendrait permanentes, y compris hors du projet.
 */
export async function loadUserConfig(): Promise<Config> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = await readFile(configPath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return ConfigSchema.parse(parsed);
  } catch (error) {
    throw new ReqraftError("config.invalid", EXIT_CODES.INVALID_CONFIGURATION, {
      params: { path: configPath },
      cause: error,
    });
  }
}

/**
 * La configuration qui s'applique ici : celle de la personne, recouverte par
 * celle du projet quand le dossier courant appartient à un projet.
 *
 * C'est celle que lisent les exécutions. Les options de la ligne de commande
 * passent par-dessus, plus loin dans la chaîne.
 */
export async function loadConfig(startDirectory?: string | null): Promise<Config> {
  const user = await loadUserConfig();
  // `null` : pas de couche projet. C'est ce que passe le desktop, qui n'a pas
  // de dossier de travail — son `cwd` est celui d'où l'application a été
  // lancée, ce qui n'exprime aucune intention.
  if (startDirectory === null) return user;

  const project = await loadProjectConfig(startDirectory);
  return mergeProjectConfig(user, project?.values ?? null);
}

export async function saveConfig(config: Config, targetPath = getConfigPath()): Promise<void> {
  const validated = ConfigSchema.parse(config);
  await writeAtomicFile(targetPath, JSON.stringify(validated, null, 2) + "\n", {
    mode: 0o600,
    dirMode: 0o700,
  });
}

export function configPath(): string {
  return getConfigPath();
}
