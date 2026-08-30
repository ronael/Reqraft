import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

/**
 * Guards one contract: `@reqraft/cli` publishes only what belongs to the CLI.
 *
 * The desktop app is built by the same repository but is not part of this
 * package. Its bundles and its packaged `.app`/`.dmg` are written under
 * `release/`, deliberately outside the `dist/` tree that `files` publishes
 * (see `tsup.desktop.config.ts` and `electron-builder.yml`). That separation
 * is structural, and this test is what stops it from being quietly undone —
 * a stray `outDir` pointing back into `dist/` would silently add megabytes of
 * Electron payload to every install.
 *
 * It asks npm for the real file list rather than re-deriving it from `files`,
 * because only npm knows how the patterns actually resolve.
 */

interface PackedFile {
  path: string;
  size: number;
}

interface PackReport {
  entryCount: number;
  size: number;
  unpackedSize: number;
  files: PackedFile[];
}

/**
 * On Windows `npm` is a `.cmd` shim, and since the CVE-2024-27980 fix Node
 * refuses to spawn `.cmd`/`.bat` directly — `execFileSync` raises EINVAL
 * unless it goes through a shell. Every argument below is a fixed literal
 * with no interpolated input, so the shell adds no injection surface.
 */
const IS_WINDOWS = process.platform === "win32";
const NPM = IS_WINDOWS ? "npm.cmd" : "npm";

/** `--ignore-scripts` keeps this from triggering a full `prepack` rebuild. */
function packReport(): PackReport {
  // Neither name has a stable absolute path across nvm, Volta, Homebrew and CI
  // images, so pinning one would break this check everywhere. The command is a
  // fixed constant with no interpolated input.
  const cache = mkdtempSync(path.join(tmpdir(), "reqraft-npm-pack-test-"));
  const env = { ...process.env };
  delete env.npm_config_verify_deps_before_run;
  env.npm_config_cache = cache;
  let stdout: string;
  try {
    stdout = execFileSync(NPM, ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      encoding: "utf8",
      env,
      maxBuffer: 32 * 1024 * 1024,
      shell: IS_WINDOWS,
    });
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
  const [report] = JSON.parse(stdout) as PackReport[];
  if (report === undefined) {
    throw new Error("npm pack --dry-run returned no report");
  }
  return report;
}

/**
 * Paths that must never ship. Matched against the packed path, so a rule
 * fires wherever the artefact lands, not only at the location it leaked from
 * the last time this went wrong.
 */
const FORBIDDEN: { label: string; matches: (path: string) => boolean }[] = [
  { label: "desktop bundles", matches: (p) => /(^|\/)desktop\//.test(p) },
  { label: "macOS app bundle", matches: (p) => p.includes(".app/") },
  { label: "macOS disk image", matches: (p) => p.endsWith(".dmg") },
  { label: "Windows installer", matches: (p) => p.endsWith(".exe") || p.endsWith(".msi") },
  { label: "Linux package", matches: (p) => /\.(AppImage|deb|rpm|snap)$/.test(p) },
  { label: "electron-builder output", matches: (p) => /(^|\/)(mac|win|linux)[-/]/.test(p) },
  { label: "electron-builder scratch files", matches: (p) => /builder-(debug|effective)/.test(p) },
  { label: "packaging icon cache", matches: (p) => p.includes(".icon-") },
  { label: "electron runtime", matches: (p) => /(^|\/)electron([-/]|$)/i.test(p) },
  { label: "release tree", matches: (p) => /(^|\/)(release|artifacts)\//.test(p) },
];

describe("npm package contents", () => {
  it("ships the CLI and nothing from the desktop app", () => {
    const report = packReport();
    const paths = report.files.map((file) => file.path);

    const leaks = FORBIDDEN.flatMap(({ label, matches }) => {
      const hits = paths.filter(matches);
      return hits.length > 0 ? [`${label}: ${hits.join(", ")}`] : [];
    });

    expect(leaks).toEqual([]);
  }, 120_000);

  it("still ships the CLI entry point and its metadata", () => {
    const paths = packReport().files.map((file) => file.path);

    // Without this, the rule above would also be satisfied by an empty
    // package — passing for the wrong reason.
    expect(paths).toContain("package.json");
    expect(paths).toContain("README.md");
    expect(paths).toContain("LICENSE");
  }, 120_000);
});
