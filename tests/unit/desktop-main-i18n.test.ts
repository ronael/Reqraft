import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mainLocale, setMainLocale, t } from "@/apps/desktop/main/i18n.js";
import { trayTooltip } from "@/apps/desktop/main/tray-icon.js";
import { DESKTOP_MESSAGES } from "@/i18n/desktop/index.js";

/**
 * La langue du processus principal.
 *
 * Le menu de la barre, les titres de fenêtre, les messages de permission et
 * les erreurs levées par l'IPC étaient écrits en français en dur : ils
 * traversent l'IPC et s'affichaient tels quels dans une interface par ailleurs
 * traduite. Ce qui est vérifié ici, c'est qu'ils passent bien par le
 * catalogue — un littéral qui revient ne se voit qu'à l'écran.
 */

afterEach(() => {
  setMainLocale("en");
});

describe("le traducteur du processus principal", () => {
  it("parle anglais tant que rien n'a été résolu", () => {
    expect(mainLocale()).toBe("en");
    expect(t("main.trayIdle")).toBe(DESKTOP_MESSAGES.en["main.trayIdle"]);
  });

  it("suit la langue choisie", () => {
    setMainLocale("fr");
    expect(t("main.trayIdle")).toBe(DESKTOP_MESSAGES.fr["main.trayIdle"]);
  });

  it("remplace les paramètres", () => {
    expect(t("main.errorProviderUnknown", { id: "fantome" })).toContain("fantome");
  });

  it("atteint le processus principal jusque dans l'infobulle du tray", () => {
    // Le tray est construit une fois au démarrage : s'il lisait une table
    // figée, changer de langue ne l'atteindrait jamais.
    setMainLocale("fr");
    expect(trayTooltip("repos")).toBe(DESKTOP_MESSAGES.fr["main.trayIdle"]);
  });
});

/** Un caractère accentué : le signe le plus sûr d'un français resté en dur. */
const ACCENTED = /[àâçèéêîïôùûœ]/i;

const MAIN_DIR = "src/apps/desktop/main";
const RENDERER_DIR = "src/apps/desktop/renderer";

/** Les sources d'un processus, sous-dossiers compris. */
async function sourcesOf(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourcesOf(full)));
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * Le corps du fichier, commentaires retirés.
 *
 * Les commentaires du dépôt sont en français : les garder ferait échouer le
 * test sur ce qui n'a jamais été affiché.
 */
function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\S\s]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");
}

describe("les chaînes du processus principal", () => {
  it("ne contient plus de littéral accentué hors catalogue", async () => {
    const offenders: string[] = [];
    for (const file of await sourcesOf(MAIN_DIR)) {
      const body = withoutComments(await readFile(file, "utf8"));
      for (const match of body.matchAll(/"[^"\n]*"/g)) {
        if (ACCENTED.test(match[0])) offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(offenders, `à passer par le catalogue :\n${offenders.join("\n")}`).toEqual([]);
  });

  it("ne réécrit pas en dur une phrase que le catalogue traduit déjà", async () => {
    // L'accent seul ne suffit pas : « Quitter Reqraft » n'en porte aucun et
    // restait invisible. Une phrase qui a une traduction ne doit pas exister
    // deux fois, sinon l'une des deux ne changera jamais de langue.
    const translated = new Set(
      [...Object.values(DESKTOP_MESSAGES.en), ...Object.values(DESKTOP_MESSAGES.fr)].filter(
        (value) => value.includes(" ") && value.length > 8,
      ),
    );

    const offenders: string[] = [];
    for (const file of await sourcesOf(MAIN_DIR)) {
      const body = withoutComments(await readFile(file, "utf8"));
      for (const match of body.matchAll(/"([^"\n]+)"/g)) {
        if (translated.has(match[1] ?? "")) offenders.push(`${file}: ${match[1] ?? ""}`);
      }
    }

    expect(offenders, `déjà traduit ailleurs :\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("les chaînes du renderer", () => {
  it("ne laisse aucun texte accentué en dur dans les écrans", async () => {
    // Le même garde-fou que pour le processus principal, sur les deux endroits
    // où le renderer écrit du texte : les littéraux et le contenu JSX. Sans
    // lui, « niveau standard » ou « télémétrie désactivée » restaient français
    // dans une fenêtre anglaise, et cela ne se voyait qu'à l'écran.
    const offenders: string[] = [];
    for (const file of await sourcesOf(RENDERER_DIR)) {
      const body = withoutComments(await readFile(file, "utf8")).replaceAll(
        /\{\/\*[\S\s]*?\*\/\}/g,
        "",
      );
      for (const match of body.matchAll(/"[^"\n]*"/g)) {
        if (ACCENTED.test(match[0])) offenders.push(`${file}: ${match[0]}`);
      }
      // Le texte JSX s'arrête aussi sur une accolade : « niveau {level} » est
      // deux morceaux, et n'en chercher qu'un laissait passer le premier.
      for (const match of body.matchAll(/[>}]([^<>{}]+)[<{]/g)) {
        const text = (match[1] ?? "").trim();
        if (ACCENTED.test(text)) offenders.push(`${file}: ${text}`);
      }
    }

    expect(offenders, `à passer par le catalogue :\n${offenders.join("\n")}`).toEqual([]);
  });
});
