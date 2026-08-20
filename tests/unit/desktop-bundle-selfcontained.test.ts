import { existsSync, readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Guards one contract: the desktop main process must run with nothing beside
 * it but Electron.
 *
 * `electron-builder.yml` excludes `node_modules/**` from the asar, on the
 * stated grounds that tsup bundles everything. That was not true: tsup
 * externalises every entry of `dependencies` by default, so `zod` survived as
 * a bare import into the packaged app and 0.3.0 died at startup with
 * ERR_MODULE_NOT_FOUND on every platform. The two configurations each looked
 * correct on their own; only together did they ship a broken app.
 *
 * So the assertion is made against the built artifact rather than against
 * either configuration: whatever the bundler is told, what leaves the build
 * must import only Node builtins and `electron`.
 *
 * `pnpm quality` runs `build:desktop` before the test suites, so the artifact
 * is there when this runs; it fails loudly rather than rebuilding, because a
 * guard that silently rebuilds can pass against something nobody shipped.
 */

const MAIN = "release/desktop/bundle/main/index.mjs";
const PRELOAD = "release/desktop/bundle/preload/index.cjs";

/** Module specifiers the runtime is expected to provide. */
const PROVIDED = new Set(["electron"]);

/** Bare specifiers, i.e. neither relative nor absolute paths. */
function bareSpecifiers(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of [
    /\bfrom\s*["']([^"'.][^"']*)["']/g,
    /\brequire\(\s*["']([^"'.][^"']*)["']\s*\)/g,
    /\bimport\(\s*["']([^"'.][^"']*)["']\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) found.add(specifier);
    }
  }
  return [...found];
}

describe("desktop main bundle", () => {
  it("imports nothing the packaged app does not ship", () => {
    expect(existsSync(MAIN), `${MAIN} is missing — run pnpm build:desktop first`).toBe(true);

    for (const file of [MAIN, PRELOAD]) {
      const unresolved = bareSpecifiers(readFileSync(file, "utf8")).filter(
        (specifier) => !isBuiltin(specifier) && !PROVIDED.has(specifier),
      );
      expect(unresolved, `${file} expects packages the asar does not contain`).toEqual([]);
    }
  });

  it("leaves electron to the runtime instead of bundling a shim", () => {
    expect(existsSync(MAIN), `${MAIN} is missing — run pnpm build:desktop first`).toBe(true);
    const source = readFileSync(MAIN, "utf8");
    // `noExternal` outranks `external`, so a pattern wide enough to catch every
    // dependency also swallowed electron and stubbed it as CommonJS.
    expect(source).not.toContain("require_electron = __commonJS");
    expect(bareSpecifiers(source)).toContain("electron");
  });
});
