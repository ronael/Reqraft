import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runProfilesDuplicate,
  runProfilesEdit,
  runProfilesExport,
  suggestProfileId,
} from "@/apps/cli/commands/profiles.js";
import { getBuiltinProfile } from "@/profiles/builtins.js";
import { parseCustomProfile, type CustomProfile } from "@/profiles/custom.js";
import { createLocalProfile, readLocalProfile } from "@/profiles/local-store.js";
import { resetProfileCatalog } from "@/profiles/catalog.js";
import { getProfile } from "@/profiles/registry.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

interface Capture {
  logs: string[];
  errors: string[];
  output: { log(message: string): void; error(message: string): void };
}

function captureOutput(): Capture {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    output: { log: (message) => logs.push(message), error: (message) => errors.push(message) },
  };
}

function scriptedAnswers(answers: string[]): (question: string) => Promise<string> {
  const queue = [...answers];
  return () => Promise.resolve(queue.shift() ?? "");
}

const LOCAL: CustomProfile = {
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support.",
  extends: "clean",
  defaultLevel: "standard",
  instructions: "Réponds avec empathie.",
};

let profilesDir: string;
let outDir: string;

beforeEach(async () => {
  profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-lifecycle-"));
  outDir = await mkdtemp(path.join(os.tmpdir(), "rp-lifecycle-out-"));
});

afterEach(async () => {
  resetProfileCatalog();
  await rm(profilesDir, { recursive: true, force: true }).catch(() => undefined);
  await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("suggestProfileId", () => {
  it("derives a usable id from a display name", () => {
    expect(suggestProfileId("Support client")).toBe("support-client");
  });

  it("strips accents rather than the letters carrying them", () => {
    expect(suggestProfileId("Rédaction web")).toBe("redaction-web");
  });

  it("returns nothing when no usable id can be derived", () => {
    // A name that collides with a built-in has no suggestion to offer: the
    // wizard falls back to asking outright rather than proposing a refusal.
    expect(suggestProfileId("clean")).toBe("");
    expect(suggestProfileId("!!!")).toBe("");
  });
});

describe("rp profiles edit", () => {
  it("rewrites the fields it is given and keeps the rest", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const { output, logs, errors } = captureOutput();

    const exitCode = await runProfilesEdit("support-client", {
      interactive: true,
      // name, description, base, level, instructions — empty keeps the value.
      ask: scriptedAnswers(["Support niveau 2", "", "", "complete", ""]),
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(errors).toEqual([]);
    const stored = await readLocalProfile("support-client", profilesDir);
    expect(stored.name).toBe("Support niveau 2");
    expect(stored.description).toBe(LOCAL.description);
    expect(stored.defaultLevel).toBe("complete");
    expect(stored.instructions).toBe(LOCAL.instructions);
    expect(stored.extends).toBe("clean");
    expect(logs.join("\n")).toContain("support-client");
    // The open catalogue sees the change without a restart.
    expect(getProfile("support-client")?.name).toBe("Support niveau 2");
  });

  it("clears an inherited base on an explicit dash", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const { output } = captureOutput();

    await runProfilesEdit("support-client", {
      interactive: true,
      ask: scriptedAnswers(["", "", "-", "", ""]),
      output,
      profilesDir,
    });

    expect((await readLocalProfile("support-client", profilesDir)).extends).toBeUndefined();
  });

  it("refuses a built-in and points at duplicate", async () => {
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesEdit("clean", {
      interactive: true,
      ask: scriptedAnswers([]),
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.join("\n")).toContain("duplicate");
  });

  it("refuses a built-in alias too", async () => {
    const { output, errors } = captureOutput();
    const exitCode = await runProfilesEdit("web-designer", {
      interactive: true,
      ask: scriptedAnswers([]),
      output,
      profilesDir,
    });
    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors).toHaveLength(1);
  });

  it("reports an unknown local profile without creating one", async () => {
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesEdit("jamais-cree", {
      interactive: true,
      ask: scriptedAnswers(["x", "y", "", "standard", "z"]),
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.length).toBeGreaterThan(0);
    await expect(readLocalProfile("jamais-cree", profilesDir)).rejects.toThrow();
  });

  it("refuses to run without a terminal", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesEdit("support-client", {
      interactive: false,
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.join("\n")).toContain("--file");
  });

  it("requires an id", async () => {
    const { output, errors } = captureOutput();
    expect(await runProfilesEdit(undefined, { output, profilesDir })).toBe(
      EXIT_CODES.INVALID_INPUT,
    );
    expect(errors.join("\n")).toContain("rp profiles edit");
  });
});

describe("rp profiles duplicate", () => {
  it("turns a built-in into a standalone local profile", async () => {
    const { output, logs, errors } = captureOutput();

    const exitCode = await runProfilesDuplicate("clean", "mon-clean", {
      output,
      profilesDir,
      name: "Mon clean",
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    const stored = await readLocalProfile("mon-clean", profilesDir);
    expect(stored.name).toBe("Mon clean");
    expect(stored.instructions).toBe(getBuiltinProfile("clean")?.instructions);
    expect(stored.extends).toBeUndefined();
    expect(logs).toHaveLength(1);
    // The flattening notice is a note, not a result: it belongs on stderr.
    expect(errors.join("\n")).toContain("clean");
    expect(getProfile("mon-clean")).toBeDefined();
  });

  it("copies a local profile and keeps its base", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesDuplicate("support-client", "support-bis", {
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // Nothing on stderr: no flattening happened.
    expect(errors).toEqual([]);
    expect((await readLocalProfile("support-bis", profilesDir)).extends).toBe("clean");
  });

  it("never overwrites an existing target", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesDuplicate("clean", "support-client", {
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_CONFIGURATION);
    expect(errors.length).toBeGreaterThan(0);
    expect((await readLocalProfile("support-client", profilesDir)).name).toBe("Support client");
  });

  it("refuses a target that would shadow a built-in", async () => {
    const { output } = captureOutput();
    expect(await runProfilesDuplicate("clean", "code", { output, profilesDir })).toBe(
      EXIT_CODES.INVALID_INPUT,
    );
  });

  it("reports an unknown source", async () => {
    const { output, errors } = captureOutput();
    expect(await runProfilesDuplicate("nowhere", "quelque-part", { output, profilesDir })).toBe(
      EXIT_CODES.INVALID_CONFIGURATION,
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("requires both ids", async () => {
    const { output, errors } = captureOutput();
    expect(await runProfilesDuplicate("clean", undefined, { output, profilesDir })).toBe(
      EXIT_CODES.INVALID_INPUT,
    );
    expect(errors.join("\n")).toContain("duplicate");
  });
});

describe("rp profiles export", () => {
  it("writes only JSON to stdout", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const { output, logs, errors } = captureOutput();

    const exitCode = await runProfilesExport("support-client", { output, profilesDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(errors).toEqual([]);
    // A single log line, parseable on its own: `rp profiles export x > x.json`
    // has to produce a valid document and nothing else.
    expect(logs).toHaveLength(1);
    expect(parseCustomProfile(logs[0] ?? "")).toEqual(LOCAL);
  });

  it("renames a built-in and says so on stderr", async () => {
    const { output, logs, errors } = captureOutput();

    const exitCode = await runProfilesExport("clean", { output, profilesDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(parseCustomProfile(logs[0] ?? "").id).toBe("clean-copy");
    // The notice must not pollute the document.
    expect(errors.join("\n")).toContain("clean-copy");
  });

  it("honours an explicit export id", async () => {
    const { output, logs } = captureOutput();
    await runProfilesExport("clean", { output, profilesDir, exportId: "ma-base" });
    expect(parseCustomProfile(logs[0] ?? "").id).toBe("ma-base");
  });

  it("writes to a file and keeps stdout empty", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const target = path.join(outDir, "support.json");
    const { output, logs, errors } = captureOutput();

    const exitCode = await runProfilesExport("support-client", {
      output,
      profilesDir,
      file: target,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(logs).toEqual([]);
    expect(errors.join("\n")).toContain(target);
    expect(parseCustomProfile(await readFile(target, "utf8"))).toEqual(LOCAL);
  });

  it("reports an unwritable destination", async () => {
    await createLocalProfile(LOCAL, { profilesDir });
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesExport("support-client", {
      output,
      profilesDir,
      file: path.join(outDir, "absent", "nested", "support.json"),
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_CONFIGURATION);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("reports an unknown profile", async () => {
    const { output, errors } = captureOutput();
    expect(await runProfilesExport("nowhere", { output, profilesDir })).toBe(
      EXIT_CODES.INVALID_INPUT,
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("requires an id", async () => {
    const { output, errors } = captureOutput();
    expect(await runProfilesExport(undefined, { output, profilesDir })).toBe(
      EXIT_CODES.INVALID_INPUT,
    );
    expect(errors.join("\n")).toContain("export");
  });
});

describe("export then import", () => {
  it("round-trips a built-in into a usable local profile", async () => {
    const { output, logs } = captureOutput();
    await runProfilesExport("writing", { output, profilesDir, exportId: "redaction" });

    await createLocalProfile(parseCustomProfile(logs[0] ?? ""), { profilesDir });

    const stored = await readLocalProfile("redaction", profilesDir);
    expect(stored.instructions).toBe(getBuiltinProfile("writing")?.instructions);
  });
});
