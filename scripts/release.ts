import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_CHARACTERS = /^[0-9A-Za-z.+-]+$/;

// The workflow a push to main triggers, named by its file in .github/workflows.
const CI_WORKFLOW = "ci.yml";
const CI_RUN_FIELDS = "databaseId,status,conclusion,url";
const CI_POLL_INTERVAL_MS = 15_000;
const MINUTE_MS = 60_000;
// GitHub creates the run a few seconds after the push.
const CI_APPEARANCE_MINUTES = 2;
// A CI run takes a few minutes; this ceiling only rules out waiting forever.
const CI_TIMEOUT_MINUTES = 45;
const CI_OUTCOMES: Record<string, string> = {
  failure: "a échoué",
  cancelled: "a été annulée",
};
const NO_TAG_CREATED = "\nAucun tag n'a été créé. Relancer « pnpm release » une fois la CI verte.";

/** Runs a command at the repository root; `capture` returns its output instead of printing it. */
export type CommandRunner = (command: string, args: string[], capture?: boolean) => string;

/** Everything the release reaches outside itself, injected so tests need no git, gh or network. */
export interface ReleaseDependencies {
  run: CommandRunner;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  log: (message: string) => void;
}

/** The fields of a GitHub Actions run that `CI_RUN_FIELDS` asks gh for. */
interface CiRun {
  databaseId: number;
  status: string;
  conclusion: string;
  url: string;
}

export function releaseTag(version: string): string {
  const core = version.split(/[+-]/, 1)[0] ?? "";
  const parts = core.split(".");
  const validCore =
    parts.length === 3 &&
    parts.every((part) => /^\d+$/.test(part) && (part === "0" || !part.startsWith("0")));
  if (!validCore || !VERSION_CHARACTERS.test(version) || /[.+-]$/.test(version)) {
    throw new Error(`Version invalide : ${version}`);
  }
  return `v${version}`;
}

function runCommand(command: string, args: string[], capture = false): string {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = capture ? (result.stderr || result.stdout).trim() : "";
    const detailsSuffix = details ? ` : ${details}` : "";
    throw new Error(`Échec de ${command} ${args.join(" ")}${detailsSuffix}`);
  }
  return capture ? result.stdout.trim() : "";
}

const SYSTEM: ReleaseDependencies = {
  run: runCommand,
  sleep: (milliseconds) => delay(milliseconds),
  now: () => Date.now(),
  log: (message) => {
    console.log(message);
  },
};

function assertReleaseState(run: CommandRunner): void {
  const branch = run("git", ["branch", "--show-current"], true);
  if (branch !== "main") {
    throw new Error(`La release doit être lancée depuis main, pas ${branch || "HEAD détachée"}.`);
  }
  if (run("git", ["status", "--porcelain"], true)) {
    throw new Error("Le dépôt doit être propre avant une release.");
  }
}

function readReleaseVersion(): string {
  const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
    version?: unknown;
  };
  if (typeof packageJson.version !== "string") {
    throw new Error("package.json ne contient pas de version valide.");
  }
  releaseTag(packageJson.version);
  return packageJson.version;
}

/**
 * The latest CI run that a push of `commit` triggered, once GitHub has created
 * it. Pull request runs are left out: they test a merge with the base branch,
 * not this exact commit.
 */
function findCiRun(commit: string, run: CommandRunner): CiRun | undefined {
  const output = run(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      CI_WORKFLOW,
      "--commit",
      commit,
      "--event",
      "push",
      "--limit",
      "1",
      "--json",
      CI_RUN_FIELDS,
    ],
    true,
  );
  const [latest] = JSON.parse(output) as CiRun[];
  return latest;
}

function viewCiRun(id: number, run: CommandRunner): CiRun {
  return JSON.parse(run("gh", ["run", "view", String(id), "--json", CI_RUN_FIELDS], true)) as CiRun;
}

/** Asks `probe` again every 15 seconds until it answers, or until `minutes` have passed. */
async function poll<T>(
  probe: () => T | undefined,
  minutes: number,
  { now, sleep }: ReleaseDependencies,
): Promise<T | undefined> {
  const deadline = now() + minutes * MINUTE_MS;
  let answer = probe();
  while (answer === undefined && now() < deadline) {
    await sleep(CI_POLL_INTERVAL_MS);
    answer = probe();
  }
  return answer;
}

/**
 * Waits for CI to pass on `commit` and refuses anything else. publish.yml runs
 * the tests again after the tag; when they failed there (v0.6.2, v0.6.4), the
 * GitHub Release already existed and npm was left a version behind.
 */
async function waitForGreenCi(commit: string, deps: ReleaseDependencies): Promise<void> {
  const shortCommit = commit.slice(0, 7);
  const started = await poll(() => findCiRun(commit, deps.run), CI_APPEARANCE_MINUTES, deps);
  if (started === undefined) {
    throw new Error(
      `Aucune exécution du workflow ${CI_WORKFLOW} n'est apparue pour ${shortCommit} en ${String(CI_APPEARANCE_MINUTES)} minutes.${NO_TAG_CREATED}`,
    );
  }
  deps.log(`Attente de la CI sur ${shortCommit} : ${started.url}`);
  const finished = await poll(
    () => {
      const current = viewCiRun(started.databaseId, deps.run);
      return current.status === "completed" ? current : undefined;
    },
    CI_TIMEOUT_MINUTES,
    deps,
  );
  if (finished === undefined) {
    throw new Error(
      `La CI n'a pas fini en ${String(CI_TIMEOUT_MINUTES)} minutes sur ${shortCommit} : ${started.url}${NO_TAG_CREATED}`,
    );
  }
  if (finished.conclusion !== "success") {
    const outcome =
      CI_OUTCOMES[finished.conclusion] ?? `s'est terminée en « ${finished.conclusion} »`;
    throw new Error(`La CI ${outcome} sur ${shortCommit} : ${finished.url}${NO_TAG_CREATED}`);
  }
  deps.log(`CI verte sur ${shortCommit}.`);
}

/**
 * Pushes `main`, waits for CI to pass on that commit, then tags it and creates
 * the GitHub Release. A CI that is not green stops the release before any tag
 * exists.
 */
export async function release(version: string, deps: ReleaseDependencies): Promise<void> {
  const tag = releaseTag(version);
  const { run } = deps;

  assertReleaseState(run);
  const commit = run("git", ["rev-parse", "HEAD"], true);
  run("git", ["push", "origin", "main"]);
  await waitForGreenCi(commit, deps);
  // Tag the commit CI checked, even if HEAD moved during the wait.
  run("git", ["tag", "-a", tag, commit, "-m", `Release ${tag}`]);
  try {
    run("git", ["push", "origin", tag]);
  } catch (error) {
    run("git", ["tag", "--delete", tag]);
    throw error;
  }
  // A prerelease must not become the latest GitHub Release either, mirroring
  // the npm dist-tag routing in .github/workflows/publish.yml.
  const isPrerelease = version.includes("-");
  run("gh", [
    "release",
    "create",
    tag,
    "--title",
    `Reqraft ${tag}`,
    "--generate-notes",
    "--verify-tag",
    isPrerelease ? "--prerelease" : "--latest",
  ]);
  deps.log(`Release ${tag} créée. GitHub Actions prend en charge la publication npm.`);
}

export async function main(): Promise<void> {
  await release(readReleaseVersion(), SYSTEM);
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`Release annulée : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
