import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "@/i18n/translate.js";
import { notifyCliUpdate, shouldRunCliUpdateNotifier } from "@/apps/cli/update-notifier.js";

describe("CLI update notifier", () => {
  it("runs only for a successful interactive command outside structured output", () => {
    const base = { argv: ["node", "rp"], env: {}, stderrIsTTY: true, exitCode: 0 };
    expect(shouldRunCliUpdateNotifier(base)).toBe(true);
    expect(shouldRunCliUpdateNotifier({ ...base, argv: [...base.argv, "--json"] })).toBe(false);
    expect(shouldRunCliUpdateNotifier({ ...base, stderrIsTTY: false })).toBe(false);
    expect(shouldRunCliUpdateNotifier({ ...base, env: { CI: "1" } })).toBe(false);
    expect(shouldRunCliUpdateNotifier({ ...base, exitCode: 1 })).toBe(false);
  });

  it("prints an available version once and persists its cache", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "reqraft-update-test-"));
    const cachePath = path.join(directory, "update-check.json");
    const output = { error: vi.fn() };
    const fetcher = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ version: "0.6.0" }),
      }),
    );
    const options = {
      currentVersion: "0.5.0",
      t: createTranslator("fr"),
      output,
      now: () => 1_000_000,
      fetcher,
      cachePath,
    };

    await notifyCliUpdate(options);
    await notifyCliUpdate(options);

    expect(output.error).toHaveBeenCalledTimes(1);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining("npm install -g"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(cachePath, "utf8"))).toMatchObject({
      latestVersion: "0.6.0",
      notifiedVersion: "0.6.0",
    });
  });
});
