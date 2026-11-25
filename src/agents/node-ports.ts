import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { AgentsPorts } from "./setup.js";

/**
 * The agents' ports on Node: the real disk, and executables looked up along a
 * `PATH` the caller chooses. The CLI passes its own; the desktop app passes
 * the login shell's, which it has to ask for.
 */
export function nodeAgentsPorts(
  searchPath: string | undefined,
  platform: NodeJS.Platform = process.platform,
  pathExt: string | undefined = process.env.PATHEXT,
): AgentsPorts {
  return {
    async readText(file) {
      try {
        return await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async writeText(file, content) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, "utf8");
    },
    findExecutable(command) {
      return findOnPath(command, searchPath, platform, pathExt);
    },
  };
}

/** Where `command` runs from along `searchPath`, or null. */
export async function findOnPath(
  command: string,
  searchPath: string | undefined,
  platform: NodeJS.Platform,
  pathExt: string | undefined,
): Promise<string | null> {
  const separator = platform === "win32" ? ";" : ":";
  const extensions =
    platform === "win32"
      ? ["", ...(pathExt ?? ".COM;.EXE;.BAT;.CMD").split(";").map((ext) => ext.toLowerCase())]
      : [""];
  for (const directory of (searchPath ?? "").split(separator)) {
    if (directory === "") continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      try {
        await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // Not here: keep looking.
      }
    }
  }
  return null;
}
