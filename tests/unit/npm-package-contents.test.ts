import { execFileSync } from "node:child_process";
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

/** `--ignore-scripts` keeps this from triggering a full `prepack` rebuild. */
function packReport(): PackReport {
  const stdout = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return (JSON.parse(stdout) as PackReport[])[0];
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
