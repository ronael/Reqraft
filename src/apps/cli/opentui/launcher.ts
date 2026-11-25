import { accessSync, constants, existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { UiLocale } from "@/i18n/locale.js";
import { createTranslator } from "@/i18n/translate.js";

export function runOpenTuiAppLauncher(uiLocale?: UiLocale): number {
  const t = createTranslator(uiLocale ?? "en");
  const entry = resolveStandaloneEntry();
  if (!entry) {
    throw new Error(t("opentui.entryMissing"));
  }
  const bun = resolveBunBinary();
  if (!bun) {
    throw new Error(t("opentui.bunRequired"));
  }

  const result = spawnSync(bun, [entry], {
    env: uiLocale ? { ...process.env, REQRAFT_UI_LOCALE: uiLocale } : process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function resolveStandaloneEntry(): string | null {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(currentDir, "standalone.js"),
    path.join(currentDir, "opentui", "standalone.js"),
    path.join(currentDir, "standalone.tsx"),
    path.join(currentDir, "opentui", "standalone.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Package managers' usual folders, the only places looked at before. */
const USUAL_BUN_PATHS = ["/opt/homebrew/bin/bun", "/usr/local/bin/bun", "/usr/bin/bun", "/bin/bun"];

/**
 * Where Bun may be, in order.
 *
 * The PATH comes first: it holds the `bun` the person runs. Bun's own
 * installer puts it in `$BUN_INSTALL/bin`, `~/.bun/bin` by default, and only
 * adds that folder to the PATH of shells opened afterwards, so those come
 * next; the package managers' folders close the list. A relative PATH entry is
 * skipped: it would run whatever `bun` sits in the current folder.
 */
export function bunCandidates(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  home: string,
): string[] {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const executable = platform === "win32" ? "bun.exe" : "bun";
  const absolute = (folder: string | undefined): folder is string =>
    folder !== undefined && folder !== "" && paths.isAbsolute(folder);
  const onPath = (env.PATH ?? "")
    .split(paths.delimiter)
    .filter(absolute)
    .map((folder) => paths.join(folder, executable));
  const installed = [env.BUN_INSTALL, paths.join(home, ".bun")]
    .filter(absolute)
    .map((folder) => paths.join(folder, "bin", executable));
  const usual = platform === "win32" ? [] : USUAL_BUN_PATHS;
  return [...new Set([...onPath, ...installed, ...usual])];
}

export function resolveBunBinary(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string | null {
  return bunCandidates(env, platform, home).find(isExecutableFile) ?? null;
}

function isExecutableFile(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}
