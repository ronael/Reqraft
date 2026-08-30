import process from "node:process";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { SCORE_VERSION, type ProfileBreakdown } from "./scoring.js";

/**
 * Comparer deux exécutions du benchmark, profil par profil.
 *
 * Une moyenne unique répond « lequel est meilleur ? » par un chiffre qui cache
 * le seul détail utile : un modèle peut gagner sur `writing` et perdre sur
 * `code`, et l'agrégat les compense. Le choix d'un modèle se fait par profil.
 *
 * Local-first : deux fichiers lus sur disque, rien d'envoyé nulle part.
 *
 *   pnpm benchmark:compare avant.json apres.json
 */

interface RunFile {
  provider: string;
  model: string;
  timestamp: string;
  scoreVersion?: number;
  aggregate: { meanTotal: number; byProfile?: ProfileBreakdown[] };
}

const ProfileBreakdownSchema = z.object({
  profile: z.string(),
  cases: z.number().int().nonnegative(),
  meanTotal: z.number(),
  meanTerms: z.number(),
  meanIntention: z.number(),
  meanNoInvention: z.number(),
  meanClarity: z.number(),
});

const RunFileSchema = z.object({
  provider: z.string(),
  model: z.string(),
  timestamp: z.string(),
  scoreVersion: z.number().int().positive().optional(),
  aggregate: z.object({
    meanTotal: z.number(),
    byProfile: z.array(ProfileBreakdownSchema).optional(),
  }),
});

export function parseRunFile(value: unknown, source: string): RunFile {
  const parsed = RunFileSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const detail = parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
  throw new Error(`${source} is not a comparable benchmark result (${detail})`);
}

interface ProfileDelta {
  profile: string;
  before: number | null;
  after: number | null;
  delta: number | null;
}

/**
 * L'écart par profil entre deux exécutions.
 *
 * Un profil absent d'un côté rend `null` plutôt que zéro : « pas mesuré » et
 * « mesuré à zéro » ne se ressemblent pas, et confondre les deux ferait lire
 * une régression là où il n'y a qu'un cas manquant.
 */
export function compareByProfile(
  before: readonly ProfileBreakdown[],
  after: readonly ProfileBreakdown[],
): ProfileDelta[] {
  const profiles = [...new Set([...before, ...after].map((row) => row.profile))].sort((a, b) =>
    a.localeCompare(b),
  );

  return profiles.map((profile) => {
    const left = before.find((row) => row.profile === profile)?.meanTotal ?? null;
    const right = after.find((row) => row.profile === profile)?.meanTotal ?? null;
    return {
      profile,
      before: left,
      after: right,
      delta: left === null || right === null ? null : right - left,
    };
  });
}

/** Deux exécutions ne se comparent que sous les mêmes règles de calcul. */
export function findVersionMismatch(before: RunFile, after: RunFile): string | undefined {
  const left = before.scoreVersion ?? 1;
  const right = after.scoreVersion ?? 1;
  if (left === right) return undefined;
  return (
    `Ces exécutions n'ont pas été calculées par les mêmes règles ` +
    `(score v${String(left)} contre v${String(right)}, actuelle v${String(SCORE_VERSION)}). ` +
    `L'écart mesurerait le changement de règles, pas celui des modèles. ` +
    `Relancez l'ancienne avec la version courante.`
  );
}

function format(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function formatDelta(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

export function formatComparison(before: RunFile, after: RunFile): string {
  const rows = compareByProfile(before.aggregate.byProfile ?? [], after.aggregate.byProfile ?? []);

  return [
    `${before.provider}/${before.model} → ${after.provider}/${after.model}`,
    "",
    `total  ${before.aggregate.meanTotal.toFixed(2)} → ${after.aggregate.meanTotal.toFixed(2)} ` +
      `(${formatDelta(after.aggregate.meanTotal - before.aggregate.meanTotal)})`,
    "",
    "| Profil | Avant | Après | Écart |",
    "|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${row.profile} | ${format(row.before)} | ${format(row.after)} | ${formatDelta(row.delta)} |`,
    ),
  ].join("\n");
}

async function main(): Promise<void> {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (beforePath === undefined || afterPath === undefined) {
    console.error("Usage : pnpm benchmark:compare <avant.json> <apres.json>");
    process.exitCode = 1;
    return;
  }

  try {
    const before = parseRunFile(
      JSON.parse(await readFile(beforePath, "utf8")) as unknown,
      beforePath,
    );
    const after = parseRunFile(JSON.parse(await readFile(afterPath, "utf8")) as unknown, afterPath);

    const mismatch = findVersionMismatch(before, after);
    if (mismatch !== undefined) {
      console.error(mismatch);
      process.exitCode = 1;
      return;
    }

    console.log(formatComparison(before, after));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("compare.ts")) {
  await main();
}
