import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { onTestFinished, vi } from "vitest";
import {
  registerIpcHandlers,
  type DesktopIpcDependencies,
  type IpcEventLike,
} from "@/apps/desktop/main/ipc.js";
import { loadUserConfig } from "@/config/loader.js";
import { getConfigPath } from "@/config/paths.js";

/**
 * Le vrai processus principal, joint comme une fenêtre le joint.
 *
 * Electron sérialise l'erreur d'un handler par `toString()`, puis
 * `ipcRenderer.invoke` la préfixe du nom du canal : une fenêtre ne reçoit
 * jamais l'erreur elle-même, seulement ce texte. Brancher le pont d'un test sur
 * ce chemin vérifie ce que la fenêtre affiche pour de vrai, et non ce qu'un
 * faux pont aurait choisi de rejeter.
 *
 * Ce fichier n'est pas une suite : il ne porte aucun `describe`, et le motif de
 * collecte de Vitest ne le ramasse pas.
 */

/** Ce que le processus principal reçoit : tout, sauf `ipcMain` et le presse-papiers. */
export type DependancesPrincipal = Omit<DesktopIpcDependencies, "ipcMain" | "clipboard">;

/** Un canal du processus principal, appelé depuis une fenêtre. */
export type CanalPrincipal = (canal: string, charge?: unknown) => Promise<unknown>;

export function joindreProcessusPrincipal(dependances: DependancesPrincipal): CanalPrincipal {
  const handlers = new Map<string, (event: IpcEventLike, payload: unknown) => unknown>();
  registerIpcHandlers({
    ...dependances,
    ipcMain: {
      handle: (canal, handler) => {
        handlers.set(canal, handler);
      },
    },
    clipboard: { writeText: () => undefined },
  });
  return async (canal, charge) => {
    const handler = handlers.get(canal);
    if (handler === undefined) throw new Error(`${canal} n'est pas enregistré`);
    try {
      return await handler({ sender: { send: () => undefined, isDestroyed: () => false } }, charge);
    } catch (erreur) {
      throw new Error(`Error invoking remote method '${canal}': ${String(erreur)}`, {
        cause: erreur,
      });
    }
  };
}

/**
 * La configuration lue sur disque par le vrai chargeur, et rien qui atteigne le
 * trousseau, le réseau ou un fichier : chaque test part d'un environnement neuf,
 * que le processus principal peut modifier sans gêner le suivant.
 */
export function dependancesSansTrousseau(): DependancesPrincipal {
  return {
    env: {},
    loadConfig: loadUserConfig,
    saveConfig: () => Promise.resolve(),
    hydrateCredentials: () => Promise.resolve(),
    secureCredentialStorageAvailable: true,
    configFileExists: () => true,
    storeCredential: () => Promise.resolve(),
    removeCredential: () => Promise.resolve(),
  };
}

/**
 * Un dossier personnel temporaire, sur toutes les plateformes.
 *
 * Comme dans `reprompt-command.test.ts` : le chargeur et les profils locaux
 * lisent alors ce dossier, jamais celui de la personne qui lance la suite. Tout
 * est défait à la fin du test.
 */
export async function isolerLeDossierPersonnel(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "rp-principal-"));
  onTestFinished(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });
  for (const name of ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "APPDATA"]) {
    vi.stubEnv(name, home);
  }
  return home;
}

/**
 * Un fichier de configuration qui ne se lit plus, là où le chargeur le cherche.
 *
 * Le vrai chargeur le lit et lève sa vraie erreur : `config.invalid`, avec le
 * chemin du fichier. Rend ce chemin, que la phrase affichée cite.
 */
export async function corrompreLaConfiguration(): Promise<string> {
  await isolerLeDossierPersonnel();
  const fichier = getConfigPath();
  await mkdir(path.dirname(fichier), { recursive: true });
  await writeFile(fichier, "{ pas du JSON", "utf8");
  return fichier;
}
