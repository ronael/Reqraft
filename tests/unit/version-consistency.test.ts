import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  VERSION_REFERENCES,
  applyVersion,
  findVersionDrift,
  readPackageVersion,
  synchronizeVersion,
} from "../../scripts/version-sync.js";

/**
 * La version se répète, et se répétait sans surveillance.
 *
 * `package.json` fait autorité au moment de la release — c'est lui que
 * `scripts/release.ts` lit pour poser le tag. Mais `src/version.ts`, les liens
 * de téléchargement du site (`docs/assets/download-platform.js`) et la page
 * `index.html` portent le même numéro, recopié à la main. Rien ne les liait :
 * un oubli produisait un site qui pointe vers une release inexistante, et
 * personne ne l'apprenait avant qu'un lien renvoie une 404.
 *
 * Ce test est le garde-fou déterministe : il relit le dépôt réel et échoue sur
 * la moindre divergence. `pnpm version:sync` répare, `pnpm version:check` — et
 * donc `pnpm release:check` — constate.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const TARGET_VERSION = "9.8.7";

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
  it("le dépôt est aligné sur package.json", () => {
    expect(findVersionDrift(ROOT, readPackageVersion(ROOT))).toEqual([]);
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

  it("signale un fichier resté en arrière", () => {
    const repositoryVersion = readPackageVersion(ROOT);
    const root = fixtureRoot(TARGET_VERSION);
    // Seul package.json a bougé : tout le reste porte encore la version du dépôt.
    const drift = findVersionDrift(root, TARGET_VERSION);

    expect(drift.length).toBeGreaterThan(0);
    expect(drift.map((entry) => entry.file)).toContain("src/version.ts");
    expect(drift.map((entry) => entry.file)).toContain("index.html");
    expect(drift.map((entry) => entry.file)).toContain("docs/assets/download-platform.js");
    for (const entry of drift) {
      expect(entry.found).toBe(repositoryVersion);
    }
  });

  it("répare, et la vérification redevient muette", () => {
    const root = fixtureRoot(TARGET_VERSION);

    const written = applyVersion(root, TARGET_VERSION);

    const alphabetically = (a: string, b: string): number => a.localeCompare(b);
    expect([...written].sort(alphabetically)).toEqual([
      "docs/assets/download-platform.js",
      "index.html",
      "src/version.ts",
    ]);
    expect(findVersionDrift(root, TARGET_VERSION)).toEqual([]);
    expect(applyVersion(root, TARGET_VERSION)).toEqual([]);
  });

  it("signale un repère supprimé même après une tentative de synchronisation", () => {
    const root = fixtureRoot(TARGET_VERSION);
    const versionFile = path.join(root, "src/version.ts");
    writeFileSync(versionFile, "export const currentVersion = getVersion();\n");

    expect(() => synchronizeVersion(root, TARGET_VERSION)).toThrow(
      "src/version.ts (constante exportée) : aucune occurrence trouvée",
    );
  });

  it("ne change que le numéro : URLs et noms d'artefacts gardent leur forme", () => {
    const repositoryVersion = readPackageVersion(ROOT);
    const root = fixtureRoot(TARGET_VERSION);
    applyVersion(root, TARGET_VERSION);

    const html = readFileSync(path.join(root, "index.html"), "utf8");
    expect(html).toContain(
      `https://github.com/ronael/Reqraft/releases/download/v${TARGET_VERSION}/Reqraft-${TARGET_VERSION}-mac-arm64.dmg`,
    );
    expect(html).toContain(
      `https://github.com/ronael/Reqraft/releases/download/v${TARGET_VERSION}/Reqraft-${TARGET_VERSION}-win-x64-experimental.exe`,
    );
    expect(html).toContain(
      `https://github.com/ronael/Reqraft/releases/download/v${TARGET_VERSION}/Reqraft-${TARGET_VERSION}-linux-x86_64-experimental.AppImage`,
    );
    expect(html).toContain(`https://github.com/ronael/Reqraft/releases/tag/v${TARGET_VERSION}`);
    expect(html).not.toContain(repositoryVersion);

    const downloads = readFileSync(path.join(root, "docs/assets/download-platform.js"), "utf8");
    expect(downloads).toContain(
      `const RELEASE_BASE = "https://github.com/ronael/Reqraft/releases/download/v${TARGET_VERSION}";`,
    );
    expect(downloads).toContain(`Reqraft-${TARGET_VERSION}-mac-arm64.dmg`);
    expect(downloads).not.toContain(repositoryVersion);

    expect(readFileSync(path.join(root, "src/version.ts"), "utf8").trim()).toBe(
      `export const version = "${TARGET_VERSION}";`,
    );
  });

  it("refuse une version que le tag de release n'accepterait pas", () => {
    const root = fixtureRoot("pas-une-version");
    expect(() => readPackageVersion(root)).toThrow();
  });
});
