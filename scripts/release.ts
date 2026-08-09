import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_CHARACTERS = /^[0-9A-Za-z.+-]+$/;

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

function run(command: string, args: string[], capture = false): string {
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

function assertReleaseState(): void {
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

export function main(): void {
  const version = readReleaseVersion();
  const tag = releaseTag(version);

  assertReleaseState();
  run("git", ["push", "origin", "main"]);
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
  try {
    run("git", ["push", "origin", tag]);
  } catch (error) {
    run("git", ["tag", "--delete", tag]);
    throw error;
  }
  run("gh", [
    "release",
    "create",
    tag,
    "--title",
    `Reqraft ${tag}`,
    "--generate-notes",
    "--verify-tag",
    "--latest",
  ]);
  console.log(`Release ${tag} créée. GitHub Actions prend en charge la publication npm.`);
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Release annulée : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
