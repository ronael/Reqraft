import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  VERSION_REFERENCES,
  applyVersion,
  findVersionDrift,
  pointSiteToRelease,
  readPackageVersion,
  readSiteVersion,
  synchronizeVersion,
} from "../../scripts/version-sync.js";

/**
 * La version se répète, et se répétait sans surveillance.
 *
 * `package.json` fait autorité pour l'application : c'est lui que
 * `scripts/release.ts` lit pour poser le tag, et `src/version.ts` le suit. Le
 * site (`docs/assets/download-platform.js`, `index.html`) suit autre chose : la
 * dernière release dont les installeurs sont en ligne. L'aligner sur
 * `package.json` le faisait pointer vers une release encore en préparation,
 * et personne ne l'apprenait avant qu'un lien renvoie une 404.
 *
 * Ce test est le garde-fou déterministe : il relit le dépôt réel et échoue sur
 * la moindre divergence. `pnpm version:sync` aligne l'application,
 * `pnpm site:sync` déplace le site, et `pnpm version:check` — donc
 * `pnpm release:check` — constate.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const TARGET_VERSION = "9.8.7";
const RELEASE_DOWNLOADS = `https://github.com/ronael/Reqraft/releases/download/v${TARGET_VERSION}`;

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Une copie minimale du dépôt : les seuls fichiers que la synchro touche. */
function fixtureRoot(version: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "reqraft-version-"));
  temporaryRoots.push(root);
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ version }, null, 2));
  mkdirSync(path.join(root, "src"), { recursive: true });
  mkdirSync(path.join(root, "docs/assets"), { recursive: true });
  for (const reference of VERSION_REFERENCES) {
    if (reference.file === "package.json") continue;
    const source = readFileSync(path.join(ROOT, reference.file), "utf8");
    writeFileSync(path.join(root, reference.file), source);
  }
  return root;
}

describe("cohérence de version", () => {
  it("l'application est alignée sur package.json", () => {
    expect(findVersionDrift(ROOT, readPackageVersion(ROOT), "package")).toEqual([]);
  });

  it("le site nomme la même release à chaque repère", () => {
    expect(() => readSiteVersion(ROOT)).not.toThrow();
  });

  it("chaque référence déclarée existe réellement dans son fichier", () => {
    // Une référence qui ne matche plus rien serait un contrôle silencieux :
    // le fichier a été restructuré et la vérification ne vérifie plus rien.
    const drift = findVersionDrift(ROOT, "0.0.0");
    for (const reference of VERSION_REFERENCES) {
      expect(
        drift.some((entry) => entry.file === reference.file && entry.label === reference.label),
        `${reference.file} / ${reference.label} devrait porter une version`,
      ).toBe(true);
    }
    expect(drift.every((entry) => entry.found !== null)).toBe(true);
  });

  it("signale l'application restée en arrière", () => {
    const repositoryVersion = readPackageVersion(ROOT);
    const root = fixtureRoot(TARGET_VERSION);
    // Seul package.json a bougé : src/version.ts porte encore la version du dépôt.
    expect(findVersionDrift(root, TARGET_VERSION, "package")).toEqual([
      { file: "src/version.ts", label: "constante exportée", found: repositoryVersion },
    ]);
  });

  it("refuse un site qui nomme deux releases", () => {
    const root = fixtureRoot(TARGET_VERSION);
    const page = path.join(root, "index.html");
    writeFileSync(
      page,
      readFileSync(page, "utf8").replace(/(?<=releases\/tag\/v)[^"]+/, TARGET_VERSION),
    );

    expect(() => readSiteVersion(root)).toThrow("index.html (lien des notes de version)");
  });

  it("répare chaque usage séparément, et la vérification redevient muette", () => {
    const root = fixtureRoot(TARGET_VERSION);
    const alphabetically = (a: string, b: string): number => a.localeCompare(b);

    expect(applyVersion(root, TARGET_VERSION, "package")).toEqual(["src/version.ts"]);
    expect([...applyVersion(root, TARGET_VERSION, "site")].sort(alphabetically)).toEqual([
      "docs/assets/download-platform.js",
      "index.html",
    ]);
    expect(findVersionDrift(root, TARGET_VERSION)).toEqual([]);
    expect(applyVersion(root, TARGET_VERSION)).toEqual([]);
  });

  it("signale un repère supprimé même après une tentative de synchronisation", () => {
    const root = fixtureRoot(TARGET_VERSION);
    const versionFile = path.join(root, "src/version.ts");
    writeFileSync(versionFile, "export const currentVersion = getVersion();\n");

    expect(() => synchronizeVersion(root, TARGET_VERSION, "package")).toThrow(
      "src/version.ts (constante exportée) : aucune occurrence trouvée",
    );
  });

  it("ne change que le numéro : URLs et noms d'artefacts gardent leur forme", () => {
    const siteVersion = readSiteVersion(ROOT);
    const root = fixtureRoot(TARGET_VERSION);
    applyVersion(root, TARGET_VERSION);

    const html = readFileSync(path.join(root, "index.html"), "utf8");
    expect(html).toContain(`${RELEASE_DOWNLOADS}/Reqraft-${TARGET_VERSION}-mac-arm64.dmg`);
    expect(html).toContain(
      `${RELEASE_DOWNLOADS}/Reqraft-${TARGET_VERSION}-win-x64-experimental.exe`,
    );
    expect(html).toContain(
      `${RELEASE_DOWNLOADS}/Reqraft-${TARGET_VERSION}-linux-x86_64-experimental.AppImage`,
    );
    expect(html).toContain(`https://github.com/ronael/Reqraft/releases/tag/v${TARGET_VERSION}`);
    expect(html).not.toContain(siteVersion);

    const downloads = readFileSync(path.join(root, "docs/assets/download-platform.js"), "utf8");
    expect(downloads).toContain(`const RELEASE_BASE = "${RELEASE_DOWNLOADS}";`);
    expect(downloads).toContain(`Reqraft-${TARGET_VERSION}-mac-arm64.dmg`);
    expect(downloads).not.toContain(siteVersion);

    expect(readFileSync(path.join(root, "src/version.ts"), "utf8").trim()).toBe(
      `export const version = "${TARGET_VERSION}";`,
    );
  });

  it("ne pointe le site vers une release que si chaque installeur y est", async () => {
    const root = fixtureRoot(TARGET_VERSION);
    const pageBefore = readFileSync(path.join(root, "index.html"), "utf8");
    const checked: string[] = [];
    const withoutWindows = (url: string): Promise<boolean> => {
      checked.push(url);
      return Promise.resolve(!url.endsWith(".exe"));
    };

    await expect(pointSiteToRelease(root, TARGET_VERSION, withoutWindows)).rejects.toThrow(
      `Reqraft-${TARGET_VERSION}-win-x64-experimental.exe`,
    );
    expect(readFileSync(path.join(root, "index.html"), "utf8")).toBe(pageBefore);
    expect([...checked].sort((a, b) => a.localeCompare(b))).toEqual([
      `${RELEASE_DOWNLOADS}/Reqraft-${TARGET_VERSION}-linux-x86_64-experimental.AppImage`,
      `${RELEASE_DOWNLOADS}/Reqraft-${TARGET_VERSION}-mac-arm64.dmg`,
      `${RELEASE_DOWNLOADS}/Reqraft-${TARGET_VERSION}-mac-arm64.zip`,
      `${RELEASE_DOWNLOADS}/Reqraft-${TARGET_VERSION}-win-x64-experimental.exe`,
    ]);

    await pointSiteToRelease(root, TARGET_VERSION, () => Promise.resolve(true));
    expect(readSiteVersion(root)).toBe(TARGET_VERSION);
  });

  it("refuse une version que le tag de release n'accepterait pas", () => {
    const root = fixtureRoot("pas-une-version");
    expect(() => readPackageVersion(root)).toThrow();
  });
});
