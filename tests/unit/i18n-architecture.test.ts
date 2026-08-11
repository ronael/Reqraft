import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { glob } from "node:fs/promises";

describe("i18n architecture", () => {
  it("keeps core, providers and locale-neutral application modules independent", async () => {
    const roots = ["src/core", "src/providers", "src/application"];
    const offenders: string[] = [];

    for (const root of roots) {
      for await (const relative of glob("**/*.ts", { cwd: root })) {
        const file = path.join(root, relative);
        const source = await readFile(file, "utf8");
        if (/from\s+["'][^"']*i18n\//.test(source)) offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
