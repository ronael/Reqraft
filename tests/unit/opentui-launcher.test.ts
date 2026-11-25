import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bunCandidates, resolveBunBinary } from "@/apps/cli/opentui/launcher.js";

/**
 * Where `rp` looks for Bun before opening its interface. It used to look only
 * in Homebrew and system folders, so a Bun installed with its own script, in
 * `~/.bun/bin`, read as missing.
 */

const BUN = process.platform === "win32" ? "bun.exe" : "bun";
let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function fakeBun(folder: string, mode = 0o755): Promise<string> {
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, BUN);
  await writeFile(file, "#!/bin/sh\n", "utf8");
  await chmod(file, mode);
  return file;
}

describe("where rp looks for Bun", () => {
  it("tries the PATH first, then Bun's own installer, then the usual folders", () => {
    expect(bunCandidates({ PATH: "/usr/bin:/Users/ada/bin" }, "darwin", "/Users/ada")).toEqual([
      "/usr/bin/bun",
      "/Users/ada/bin/bun",
      "/Users/ada/.bun/bin/bun",
      "/opt/homebrew/bin/bun",
      "/usr/local/bin/bun",
      "/bin/bun",
    ]);
  });

  it("follows BUN_INSTALL, and never a relative PATH entry", () => {
    const env = { PATH: ".:bin::/srv/tools", BUN_INSTALL: "/opt/bun" };
    expect(bunCandidates(env, "linux", "/home/ada").slice(0, 3)).toEqual([
      "/srv/tools/bun",
      "/opt/bun/bin/bun",
      "/home/ada/.bun/bin/bun",
    ]);
  });

  it("looks for bun.exe under Windows, where Bun's installer also uses .bun\\bin", () => {
    const env = { PATH: "C:\\Windows;C:\\Users\\ada\\scoop\\shims" };
    expect(bunCandidates(env, "win32", "C:\\Users\\ada")).toEqual([
      "C:\\Windows\\bun.exe",
      "C:\\Users\\ada\\scoop\\shims\\bun.exe",
      "C:\\Users\\ada\\.bun\\bin\\bun.exe",
    ]);
  });

  it("finds a Bun installed in ~/.bun/bin even off the PATH", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "rq-bun-"));
    const bun = await fakeBun(path.join(directory, ".bun", "bin"));
    expect(resolveBunBinary({ PATH: "" }, process.platform, directory)).toBe(bun);
  });

  it.skipIf(process.platform === "win32")("skips a bun that cannot be run", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "rq-bun-"));
    await fakeBun(path.join(directory, "a"), 0o644);
    const runnable = await fakeBun(path.join(directory, "b"));
    const env = { PATH: [path.join(directory, "a"), path.join(directory, "b")].join(":") };
    expect(resolveBunBinary(env, process.platform, directory)).toBe(runnable);
  });
});
