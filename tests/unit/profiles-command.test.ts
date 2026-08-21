import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runProfilesAdd, runProfilesRemove } from "@/apps/cli/commands/profiles.js";
import { loadProfileCatalog, resetProfileCatalog } from "@/profiles/catalog.js";
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
    output: {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
    },
  };
}

/** Feeds the wizard a fixed script; extra questions get an empty answer. */
function scriptedAnswers(answers: string[]): (question: string) => Promise<string> {
  const queue = [...answers];
  return (_question: string) => Promise.resolve(queue.shift() ?? "");
}

/**
 * The wizard asks name first, because the id is suggested from it; then id,
 * description, optional built-in base, level and instructions. An empty answer
 * to the id question accepts the suggestion, and an empty base means none.
 */
const VALID_ANSWERS = [
  "Support client",
  "support-client",
  "Reformule pour le support.",
  "",
  "complete",
  "Réponds avec empathie.",
];

let profilesDir: string;
let importDir: string;

beforeEach(async () => {
  profilesDir = await mkdtemp(path.join(os.tmpdir(), "rp-profiles-cmd-"));
  importDir = await mkdtemp(path.join(os.tmpdir(), "rp-profiles-import-"));
});

afterEach(async () => {
  resetProfileCatalog();
  await rm(profilesDir, { recursive: true, force: true }).catch(() => undefined);
  await rm(importDir, { recursive: true, force: true }).catch(() => undefined);
});

async function storedProfile(id: string): Promise<Record<string, unknown>> {
  const content = await readFile(path.join(profilesDir, `${id}.reqraft-profile.json`), "utf8");
  return JSON.parse(content) as Record<string, unknown>;
}

async function writeImportFile(name: string, content: unknown): Promise<string> {
  const file = path.join(importDir, name);
  await writeFile(
    file,
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
    "utf8",
  );
  return file;
}

const IMPORTABLE_PROFILE = {
  schemaVersion: 1,
  id: "tech-lead",
  name: "Tech lead",
  description: "Reformule pour les revues d'architecture.",
  extends: "code",
  defaultLevel: "standard",
  instructions: "Sois rigoureux sur les contraintes.",
};

describe("rp profiles add — interactive wizard", () => {
  it("asks its questions in order and stores the profile", async () => {
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesAdd({
      interactive: true,
      ask: scriptedAnswers(VALID_ANSWERS),
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(errors).toEqual([]);
    expect(await storedProfile("support-client")).toEqual({
      schemaVersion: 1,
      id: "support-client",
      name: "Support client",
      description: "Reformule pour le support.",
      defaultLevel: "complete",
      instructions: "Réponds avec empathie.",
    });
    // Usable immediately, without restarting the process.
    expect(getProfile("support-client")?.name).toBe("Support client");
  });

  it("asks again after an invalid identifier", async () => {
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesAdd({
      interactive: true,
      // Name, then two refused ids, then the valid run from the id onwards.
      ask: scriptedAnswers(["Support client", "Support Client", "auto", ...VALID_ANSWERS.slice(1)]),
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(errors.filter((message) => message.includes("Identifiant invalide"))).toHaveLength(2);
    expect((await storedProfile("support-client")).id).toBe("support-client");
  });

  it("refuses an identifier already taken by a local profile", async () => {
    const { output } = captureOutput();
    await runProfilesAdd({
      interactive: true,
      ask: scriptedAnswers(VALID_ANSWERS),
      output,
      profilesDir,
    });
    const stored = await storedProfile("support-client");

    const second = captureOutput();
    const exitCode = await runProfilesAdd({
      interactive: true,
      ask: scriptedAnswers([
        "Support client",
        "support-client",
        "support-client",
        "support-client",
      ]),
      output: second.output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(second.errors.join("\n")).toContain("existe déjà");
    expect(await storedProfile("support-client")).toEqual(stored);
  });

  it("gives up instead of looping when answers stay invalid", async () => {
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesAdd({
      interactive: true,
      ask: scriptedAnswers([]),
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.join("\n")).toContain("abandonnée");
    expect(await readdir(profilesDir)).toEqual([]);
  });

  it("refuses an invalid level", async () => {
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesAdd({
      interactive: true,
      ask: scriptedAnswers([
        "support-client",
        "Support client",
        "Reformule pour le support.",
        "ultra",
        "expert",
        "maximal",
      ]),
      output,
      profilesDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.join("\n")).toContain("Niveau invalide");
    expect(await readdir(profilesDir)).toEqual([]);
  });

  it("refuses to run the wizard without an interactive terminal", async () => {
    const { output, logs, errors } = captureOutput();

    const exitCode = await runProfilesAdd({ interactive: false, output, profilesDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(logs).toEqual([]);
    expect(errors.join("\n")).toContain("--file");
    expect(await readdir(profilesDir)).toEqual([]);
  });
});

describe("rp profiles add --file — non-interactive import", () => {
  it("imports a strict JSON profile without asking anything", async () => {
    const { output, logs, errors } = captureOutput();
    const file = await writeImportFile("tech-lead.reqraft-profile.json", IMPORTABLE_PROFILE);

    const exitCode = await runProfilesAdd({ file, output, profilesDir, interactive: false });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(errors).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("tech-lead");
    expect(await storedProfile("tech-lead")).toEqual(IMPORTABLE_PROFILE);
    // `extends` is resolved on the way to the engine, never stored resolved.
    expect(getProfile("tech-lead")?.instructions).toContain("Sois rigoureux sur les contraintes.");
    expect(getProfile("tech-lead")?.instructions).not.toBe("Sois rigoureux sur les contraintes.");
  });

  it("refuses an unknown field rather than ignoring it", async () => {
    const { output, logs, errors } = captureOutput();
    const file = await writeImportFile("typo.json", {
      ...IMPORTABLE_PROFILE,
      id: "typo",
      instruction: "champ mal orthographié",
    });

    const exitCode = await runProfilesAdd({ file, output, profilesDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(logs).toEqual([]);
    expect(errors.join("\n")).toContain("typo.json");
    expect(await readdir(profilesDir)).toEqual([]);
  });

  it("refuses malformed JSON, a missing file, a built-in id and a built-in alias", async () => {
    const cases: { name: string; file: string }[] = [
      { name: "malformed", file: await writeImportFile("malformed.json", "{ not json") },
      { name: "absent", file: path.join(importDir, "absent.json") },
      {
        name: "builtin id",
        file: await writeImportFile("clean.reqraft-profile.json", {
          ...IMPORTABLE_PROFILE,
          id: "clean",
        }),
      },
      {
        name: "builtin alias",
        file: await writeImportFile("alias.json", {
          ...IMPORTABLE_PROFILE,
          id: "web-designer",
        }),
      },
    ];

    for (const testCase of cases) {
      const { output, logs, errors } = captureOutput();
      const exitCode = await runProfilesAdd({ file: testCase.file, output, profilesDir });

      expect(exitCode, testCase.name).toBe(EXIT_CODES.INVALID_INPUT);
      expect(logs, testCase.name).toEqual([]);
      expect(errors.length, testCase.name).toBeGreaterThan(0);
    }
    expect(await readdir(profilesDir)).toEqual([]);
  });

  it("never overwrites an existing local profile", async () => {
    const file = await writeImportFile("tech-lead.reqraft-profile.json", IMPORTABLE_PROFILE);
    await runProfilesAdd({ file, output: captureOutput().output, profilesDir });

    const replacement = await writeImportFile("tech-lead-2.json", {
      ...IMPORTABLE_PROFILE,
      name: "Écrasement",
    });
    const { output, logs, errors } = captureOutput();
    const exitCode = await runProfilesAdd({ file: replacement, output, profilesDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_CONFIGURATION);
    expect(logs).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect((await storedProfile("tech-lead")).name).toBe("Tech lead");
  });
});

describe("rp profiles remove", () => {
  async function seedLocalProfile(): Promise<void> {
    const file = await writeImportFile("tech-lead.reqraft-profile.json", IMPORTABLE_PROFILE);
    const exitCode = await runProfilesAdd({ file, output: captureOutput().output, profilesDir });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
  }

  const notTheDefault = (): Promise<string> => Promise.resolve("auto");

  it("deletes a local profile once confirmed", async () => {
    await seedLocalProfile();
    const { output, logs, errors } = captureOutput();

    const exitCode = await runProfilesRemove("tech-lead", {
      output,
      profilesDir,
      confirm: () => Promise.resolve("y"),
      readDefaultProfile: notTheDefault,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(errors).toEqual([]);
    expect(logs.join("\n")).toContain("tech-lead");
    expect(await readdir(profilesDir)).toEqual([]);
    expect(getProfile("tech-lead")).toBeUndefined();
  });

  it("keeps the profile when the confirmation is declined", async () => {
    await seedLocalProfile();
    const { output, logs } = captureOutput();

    const exitCode = await runProfilesRemove("tech-lead", {
      output,
      profilesDir,
      confirm: () => Promise.resolve("n"),
      readDefaultProfile: notTheDefault,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(logs.join("\n")).toContain("annulée");
    expect(await readdir(profilesDir)).toEqual(["tech-lead.reqraft-profile.json"]);
  });

  it("refuses auto, built-in profiles and their aliases without asking", async () => {
    for (const id of ["auto", "clean", "web-design", "web-designer"]) {
      const { output, errors } = captureOutput();
      let asked = false;

      const exitCode = await runProfilesRemove(id, {
        output,
        profilesDir,
        confirm: () => {
          asked = true;
          return Promise.resolve("y");
        },
        readDefaultProfile: notTheDefault,
      });

      expect(exitCode, id).toBe(EXIT_CODES.INVALID_INPUT);
      expect(asked, id).toBe(false);
      expect(errors.join("\n"), id).toContain(id);
    }
  });

  it("refuses an unknown local profile", async () => {
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesRemove("never-created", {
      output,
      profilesDir,
      confirm: () => Promise.resolve("y"),
      readDefaultProfile: notTheDefault,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("reports the usage when no id is given", async () => {
    const { output, errors } = captureOutput();

    const exitCode = await runProfilesRemove(undefined, { output, profilesDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors.join("\n")).toContain("rp profiles remove");
  });

  it("refuses to leave defaultProfile pointing at a deleted profile", async () => {
    await seedLocalProfile();
    const { output, errors } = captureOutput();
    let asked = false;

    const exitCode = await runProfilesRemove("tech-lead", {
      output,
      profilesDir,
      confirm: () => {
        asked = true;
        return Promise.resolve("y");
      },
      readDefaultProfile: () => Promise.resolve("tech-lead"),
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_CONFIGURATION);
    expect(asked).toBe(false);
    expect(errors.join("\n")).toContain("defaultProfile");
    expect(await readdir(profilesDir)).toEqual(["tech-lead.reqraft-profile.json"]);
  });

  it("removes a profile whose file is unreadable", async () => {
    await writeFile(path.join(profilesDir, "broken.reqraft-profile.json"), "{ not json", "utf8");
    const catalog = await loadProfileCatalog({ profilesDir });
    expect(catalog.problems.map((problem) => problem.id)).toEqual(["broken"]);

    const { output } = captureOutput();
    const exitCode = await runProfilesRemove("broken", {
      output,
      profilesDir,
      confirm: () => Promise.resolve("yes"),
      readDefaultProfile: notTheDefault,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(await readdir(profilesDir)).toEqual([]);
  });
});
