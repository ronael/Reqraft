import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseTag } from "./release.js";

/**
 * Un seul numéro de version, recopié à quatre endroits.
 *
 * `package.json` fait autorité : c'est lui que `scripts/release.ts` lit pour
 * poser le tag, et lui que npm publie. Mais `src/version.ts` (affiché par le
 * CLI et par les Réglages Desktop), les cibles de téléchargement du site et la
 * page `index.html` portent le même numéro, écrit à la main. Rien ne les
 * reliait : publier sans mettre le site à jour laisse des liens vers une
 * release qui n'existe pas, et l'erreur ne se voit qu'en cliquant.
 *
 * Le choix ici est le plus petit qui tienne : pas de génération de site, pas de
 * gabarit, pas de dépendance. Une liste de repères — un fichier, une étiquette,
 * une expression qui isole le numéro et lui seul — que `--write` réécrit et que
 * la vérification relit. Les URLs et les noms d'artefacts gardent exactement
 * leur forme : seule la portion de version est remplacée.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Ce qu'une version peut contenir, hors du `v` de tête d'un tag. */
const VERSION_TOKEN = String.raw`[0-9][0-9A-Za-z.+-]*`;
/**
 * La même chose, paresseuse.
 *
 * Le tiret fait partie des caractères d'une version (`0.7.0-beta.1`) et sépare
 * aussi le numéro de la plateforme dans `Reqraft-0.7.0-mac-arm64.dmg`. En
 * gourmand, la capture avalerait `-mac-arm64.dmg` ; en paresseux elle s'arrête
 * au premier suffixe de plateforme, qui est le bon.
 */
const LAZY_VERSION_TOKEN = String.raw`[0-9][0-9A-Za-z.+-]*?`;

/** Les deux pages du site portent les mêmes noms d'artefacts. */
const ARTEFACT_LABEL = "nom d'artefact";
const DOWNLOAD_SCRIPT = "docs/assets/download-platform.js";
const LANDING_PAGE = "index.html";

export interface VersionReference {
  /** Chemin relatif à la racine du dépôt. */
  file: string;
  /** Ce que ce repère désigne, pour que l'échec se lise sans ouvrir le fichier. */
  label: string;
  /**
   * Isole la version, et rien d'autre.
   *
   * Chaque expression n'utilise que des assertions autour du numéro
   * (`lookbehind` / `lookahead`), pour que la réécriture soit un simple
   * remplacement du texte trouvé — jamais une reconstruction de l'URL.
   */
  pattern: RegExp;
}

export const VERSION_REFERENCES: readonly VersionReference[] = [
  {
    file: "src/version.ts",
    label: "constante exportée",
    pattern: /(?<=^export const version = ")[^"]+(?=";$)/gm,
  },
  {
    file: DOWNLOAD_SCRIPT,
    label: "base des téléchargements",
    pattern: new RegExp(String.raw`(?<=releases/download/v)${VERSION_TOKEN}`, "g"),
  },
  {
    file: DOWNLOAD_SCRIPT,
    label: ARTEFACT_LABEL,
    pattern: new RegExp(String.raw`(?<=Reqraft-)${LAZY_VERSION_TOKEN}(?=-(?:mac|win|linux))`, "g"),
  },
  {
    file: LANDING_PAGE,
    label: "lien de téléchargement",
    pattern: new RegExp(String.raw`(?<=releases/download/v)${VERSION_TOKEN}`, "g"),
  },
  {
    file: LANDING_PAGE,
    label: "lien des notes de version",
    pattern: new RegExp(String.raw`(?<=releases/tag/v)${VERSION_TOKEN}`, "g"),
  },
  {
    file: LANDING_PAGE,
    label: ARTEFACT_LABEL,
    pattern: new RegExp(String.raw`(?<=Reqraft-)${LAZY_VERSION_TOKEN}(?=-(?:mac|win|linux))`, "g"),
  },
  {
    file: LANDING_PAGE,
    label: "version affichée",
    pattern: new RegExp(String.raw`(?<=>v)${VERSION_TOKEN}(?=<)`, "g"),
  },
];

export interface VersionDrift {
  file: string;
  label: string;
  /** La valeur trouvée, ou `null` quand le repère ne trouve plus rien. */
  found: string | null;
}

/**
 * La version que `package.json` déclare, refusée si un tag ne pourrait en
 * sortir — la même règle que `scripts/release.ts`, empruntée plutôt que
 * réécrite.
 */
export function readPackageVersion(root: string = ROOT): string {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    version?: unknown;
  };
  if (typeof manifest.version !== "string") {
    throw new Error("package.json ne contient pas de version valide.");
  }
  releaseTag(manifest.version);
  return manifest.version;
}

/** Chaque repère qui ne dit pas `expected`, y compris ceux qui ne disent rien. */
export function findVersionDrift(root: string, expected: string): VersionDrift[] {
  const drift: VersionDrift[] = [];
  for (const reference of VERSION_REFERENCES) {
    const content = readFileSync(join(root, reference.file), "utf8");
    const matches = [...content.matchAll(reference.pattern)].map((match) => match[0]);
    if (matches.length === 0) {
      drift.push({ file: reference.file, label: reference.label, found: null });
      continue;
    }
    for (const found of new Set(matches)) {
      if (found !== expected) {
        drift.push({ file: reference.file, label: reference.label, found });
      }
    }
  }
  return drift;
}

/** Aligne les fichiers sur `version` ; rend ceux qui ont réellement changé. */
export function applyVersion(root: string, version: string): string[] {
  const changed = new Set<string>();
  for (const file of new Set(VERSION_REFERENCES.map((reference) => reference.file))) {
    const target = join(root, file);
    const before = readFileSync(target, "utf8");
    let after = before;
    for (const reference of VERSION_REFERENCES.filter((entry) => entry.file === file)) {
      after = after.replace(reference.pattern, () => version);
    }
    if (after !== before) {
      writeFileSync(target, after);
      changed.add(file);
    }
  }
  return [...changed];
}

/** Applique la version et refuse de déclarer la synchronisation terminée si un repère manque. */
export function synchronizeVersion(root: string, version: string): string[] {
  const changed = applyVersion(root, version);
  const remainingDrift = findVersionDrift(root, version);
  if (remainingDrift.length > 0) {
    const details = remainingDrift
      .map(
        (entry) =>
          `  ${entry.file} (${entry.label}) : ${entry.found ?? "aucune occurrence trouvée"}`,
      )
      .join("\n");
    throw new Error(`La synchronisation de la version ${version} reste incomplète :\n${details}`);
  }
  return changed;
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const version = readPackageVersion(ROOT);
  if (argv.includes("--write")) {
    const changed = synchronizeVersion(ROOT, version);
    console.log(
      changed.length === 0
        ? `Version ${version} : rien à mettre à jour.`
        : `Version ${version} appliquée à ${[...changed].sort((a, b) => a.localeCompare(b)).join(", ")}.`,
    );
    return;
  }

  const drift = findVersionDrift(ROOT, version);
  if (drift.length === 0) {
    console.log(`Version ${version} : tous les fichiers concordent.`);
    return;
  }
  const details = drift
    .map(
      (entry) => `  ${entry.file} (${entry.label}) : ${entry.found ?? "aucune occurrence trouvée"}`,
    )
    .join("\n");
  throw new Error(
    `package.json annonce ${version}, mais :\n${details}\nLancer « pnpm version:sync » pour aligner.`,
  );
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
