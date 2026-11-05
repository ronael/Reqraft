import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseTag } from "./release.js";

/**
 * Un seul numéro de version, recopié à plusieurs endroits, pour deux usages.
 *
 * `package.json` fait autorité pour l'application : c'est lui que
 * `scripts/release.ts` lit pour poser le tag, et lui que npm publie.
 * `src/version.ts` (affiché par le CLI et par les Réglages Desktop) le suit, et
 * `--write` l'aligne.
 *
 * Le site, lui, propose des installeurs. Ses liens (`index.html` et
 * `docs/assets/download-platform.js`) portent la version de la dernière release
 * qui les contient vraiment, pas celle qu'on prépare : les aligner sur
 * `package.json` avait fait pointer le site vers une 0.6.5 encore inexistante,
 * donc vers des 404. Ils ne bougent qu'avec `--site`, qui vérifie d'abord que la
 * release contient chaque installeur proposé.
 *
 * Le choix reste le plus petit qui tienne : pas de génération de site, pas de
 * gabarit, pas de dépendance. Une liste de repères — un fichier, une étiquette,
 * une expression qui isole le numéro et lui seul — que la synchronisation
 * réécrit et que la vérification relit. Les URLs et les noms d'artefacts gardent
 * exactement leur forme : seule la portion de version est remplacée.
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
const RELEASE_DOWNLOADS = "https://github.com/ronael/Reqraft/releases/download";
/** Un installeur cité par le site, capturé sans sa version : `mac-arm64.dmg`, … */
const ARTEFACT_NAME = new RegExp(
  String.raw`Reqraft-${LAZY_VERSION_TOKEN}-((?:mac|win|linux)[\w.-]*)`,
  "g",
);

/**
 * La version qu'un repère doit porter : `package` suit `package.json`, `site`
 * suit la dernière release dont les installeurs sont en ligne.
 */
export type VersionScope = "package" | "site";

export interface VersionReference {
  /** Chemin relatif à la racine du dépôt. */
  file: string;
  /** Ce que ce repère désigne, pour que l'échec se lise sans ouvrir le fichier. */
  label: string;
  scope: VersionScope;
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
    scope: "package",
    pattern: /(?<=^export const version = ")[^"]+(?=";$)/gm,
  },
  {
    file: DOWNLOAD_SCRIPT,
    label: "base des téléchargements",
    scope: "site",
    pattern: new RegExp(String.raw`(?<=releases/download/v)${VERSION_TOKEN}`, "g"),
  },
  {
    file: DOWNLOAD_SCRIPT,
    label: ARTEFACT_LABEL,
    scope: "site",
    pattern: new RegExp(String.raw`(?<=Reqraft-)${LAZY_VERSION_TOKEN}(?=-(?:mac|win|linux))`, "g"),
  },
  {
    file: LANDING_PAGE,
    label: "lien de téléchargement",
    scope: "site",
    pattern: new RegExp(String.raw`(?<=releases/download/v)${VERSION_TOKEN}`, "g"),
  },
  {
    file: LANDING_PAGE,
    label: "lien des notes de version",
    scope: "site",
    pattern: new RegExp(String.raw`(?<=releases/tag/v)${VERSION_TOKEN}`, "g"),
  },
  {
    file: LANDING_PAGE,
    label: ARTEFACT_LABEL,
    scope: "site",
    pattern: new RegExp(String.raw`(?<=Reqraft-)${LAZY_VERSION_TOKEN}(?=-(?:mac|win|linux))`, "g"),
  },
  {
    file: LANDING_PAGE,
    label: "version affichée",
    scope: "site",
    pattern: new RegExp(String.raw`(?<=>v)${VERSION_TOKEN}(?=<)`, "g"),
  },
];

export interface VersionDrift {
  file: string;
  label: string;
  /** La valeur trouvée, ou `null` quand le repère ne trouve plus rien. */
  found: string | null;
}

/** Les repères d'un usage, ou tous quand aucun n'est précisé. */
function referencesFor(scope?: VersionScope): readonly VersionReference[] {
  return scope === undefined
    ? VERSION_REFERENCES
    : VERSION_REFERENCES.filter((reference) => reference.scope === scope);
}

function describeDrift(drift: readonly VersionDrift[]): string {
  return drift
    .map(
      (entry) => `  ${entry.file} (${entry.label}) : ${entry.found ?? "aucune occurrence trouvée"}`,
    )
    .join("\n");
}

function listFiles(files: readonly string[]): string {
  return [...files].sort((a, b) => a.localeCompare(b)).join(", ");
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
export function findVersionDrift(
  root: string,
  expected: string,
  scope?: VersionScope,
): VersionDrift[] {
  const drift: VersionDrift[] = [];
  for (const reference of referencesFor(scope)) {
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

/**
 * La release que le site propose, refusée si ses repères ne la nomment pas
 * tous : un site qui mélange deux versions envoie une plateforme vers une 404.
 */
export function readSiteVersion(root: string = ROOT): string {
  const found = new Set<string>();
  for (const reference of referencesFor("site")) {
    const content = readFileSync(join(root, reference.file), "utf8");
    for (const match of content.matchAll(reference.pattern)) {
      found.add(match[0]);
    }
  }
  const [candidate] = [...found];
  if (candidate === undefined) {
    throw new Error("Le site ne porte aucune version.");
  }
  const drift = findVersionDrift(root, candidate, "site");
  if (drift.length > 0) {
    throw new Error(
      `Le site doit nommer la même release partout ; à côté de ${candidate} :\n${describeDrift(drift)}`,
    );
  }
  return candidate;
}

/** Aligne les repères sur `version` ; rend les fichiers qui ont réellement changé. */
export function applyVersion(root: string, version: string, scope?: VersionScope): string[] {
  const references = referencesFor(scope);
  const changed = new Set<string>();
  for (const file of new Set(references.map((reference) => reference.file))) {
    const target = join(root, file);
    const before = readFileSync(target, "utf8");
    let after = before;
    for (const reference of references.filter((entry) => entry.file === file)) {
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
export function synchronizeVersion(root: string, version: string, scope?: VersionScope): string[] {
  const changed = applyVersion(root, version, scope);
  const remainingDrift = findVersionDrift(root, version, scope);
  if (remainingDrift.length > 0) {
    throw new Error(
      `La synchronisation de la version ${version} reste incomplète :\n${describeDrift(remainingDrift)}`,
    );
  }
  return changed;
}

/** Chaque installeur que le site propose, à son adresse dans la release `version`. */
export function siteDownloadUrls(root: string, version: string): string[] {
  const names = new Set<string>();
  for (const file of new Set(referencesFor("site").map((reference) => reference.file))) {
    for (const match of readFileSync(join(root, file), "utf8").matchAll(ARTEFACT_NAME)) {
      const platformSuffix = match[1];
      if (platformSuffix !== undefined) {
        names.add(`Reqraft-${version}-${platformSuffix}`);
      }
    }
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `${RELEASE_DOWNLOADS}/v${version}/${name}`);
}

/** GitHub redirige les téléchargements vers son stockage : la redirection est suivie. */
async function assetExists(url: string): Promise<boolean> {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  return response.ok;
}

/**
 * Pointe le site vers la release `version`, seulement si elle contient chaque
 * installeur que le site propose. Sinon rien n'est écrit : un site en retard
 * d'une version vaut mieux qu'un site qui renvoie des 404.
 */
export async function pointSiteToRelease(
  root: string,
  version: string,
  exists: (url: string) => Promise<boolean> = assetExists,
): Promise<string[]> {
  releaseTag(version);
  const urls = siteDownloadUrls(root, version);
  const checks = await Promise.all(urls.map(async (url) => ({ url, found: await exists(url) })));
  const missing = checks.filter((check) => !check.found).map((check) => `  ${check.url}`);
  if (missing.length > 0) {
    throw new Error(
      `La release v${version} ne contient pas tous les installeurs du site :\n${missing.join("\n")}\nAttendre que le workflow desktop les attache, puis relancer.`,
    );
  }
  return synchronizeVersion(root, version, "site");
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const version = readPackageVersion(ROOT);

  const siteFlag = argv.indexOf("--site");
  if (siteFlag !== -1) {
    const target = argv[siteFlag + 1] ?? version;
    const changed = await pointSiteToRelease(ROOT, target);
    console.log(
      changed.length === 0
        ? `Le site propose déjà la release v${target}.`
        : `Site pointé vers la release v${target} : ${listFiles(changed)}.`,
    );
    return;
  }

  if (argv.includes("--write")) {
    const changed = synchronizeVersion(ROOT, version, "package");
    console.log(
      changed.length === 0
        ? `Version ${version} : rien à mettre à jour.`
        : `Version ${version} appliquée à ${listFiles(changed)}.`,
    );
    return;
  }

  const drift = findVersionDrift(ROOT, version, "package");
  if (drift.length > 0) {
    throw new Error(
      `package.json annonce ${version}, mais :\n${describeDrift(drift)}\nLancer « pnpm version:sync » pour aligner.`,
    );
  }
  console.log(
    `Version ${version} : l'application concorde. Le site propose la release v${readSiteVersion(ROOT)}.`,
  );
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
