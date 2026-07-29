import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listAliases, removeAlias, setAlias } from "../../src/aliases/manager.js";
import { runAlias } from "../../src/commands/aliases.js";
import { EXIT_CODES } from "../../src/utils/exit-codes.js";

function captureOutput(): {
  output: { log(message: string): void; error(message: string): void };
  logs: string[];
  errors: string[];
} {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    output: {
      log(message: string): void {
        logs.push(message);
      },
      error(message: string): void {
        errors.push(message);
      },
    },
    logs,
    errors,
  };
}

describe("alias manager on temporary files", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "rp-alias-"));
    configPath = path.join(tempDir, ".bashrc");
  });

  it("sets a new alias", async () => {
    const operation = await setAlias(configPath, "bash", "p", false);
    expect(operation.added).toContain("p");
    const content = readFileSync(configPath, "utf8");
    expect(content).toContain('alias p="rp"');
    expect(content).toContain("# >>> rp aliases >>>");
    expect(content).toContain("# <<< rp aliases <<<");
  });

  it("sets a second alias without overwriting the first", async () => {
    await setAlias(configPath, "bash", "p", false);
    await setAlias(configPath, "bash", "ask", false);
    const content = readFileSync(configPath, "utf8");
    expect(content).toContain('alias p="rp"');
    expect(content).toContain('alias ask="rp"');
  });

  it("lists aliases", async () => {
    await setAlias(configPath, "bash", "p", false);
    await setAlias(configPath, "bash", "ask", false);
    const aliases = await listAliases(configPath, "bash");
    expect(aliases).toContain("p");
    expect(aliases).toContain("ask");
  });

  it("removes an alias", async () => {
    await setAlias(configPath, "bash", "p", false);
    await removeAlias(configPath, "bash", "p", false);
    const aliases = await listAliases(configPath, "bash");
    expect(aliases).not.toContain("p");
  });

  it("preserves external content", async () => {
    const existing = "# existing config\nexport PATH=...\n";
    writeFileSync(configPath, existing, "utf8");
    await setAlias(configPath, "bash", "p", false);
    const content = readFileSync(configPath, "utf8");
    expect(content).toContain("# existing config");
    expect(content).toContain("export PATH=...");
    expect(content).toContain('alias p="rp"');
  });

  it("supports dry-run", async () => {
    const operation = await setAlias(configPath, "bash", "p", true);
    expect(operation.added).toContain("p");
    expect(() => readFileSync(configPath, "utf8")).toThrow();
  });

  it("rejects invalid aliases", async () => {
    await expect(setAlias(configPath, "bash", "", false)).rejects.toThrow("vide");
    await expect(setAlias(configPath, "bash", "rp", false)).rejects.toThrow("réservé");
    await expect(setAlias(configPath, "bash", "a b", false)).rejects.toThrow("invalides");
  });

  it("rejects duplicate aliases", async () => {
    await setAlias(configPath, "bash", "p", false);
    await expect(setAlias(configPath, "bash", "p", false)).rejects.toThrow("existe déjà");
  });
});

describe("alias command", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "rp-alias-command-"));
    configPath = path.join(tempDir, ".bashrc");
  });

  it("returns invalid input without exiting when the alias name is missing", async () => {
    const { output, errors } = captureOutput();

    await expect(runAlias("set", undefined, { output, shell: "bash", configPath })).resolves.toBe(
      EXIT_CODES.INVALID_INPUT,
    );
    expect(errors).toEqual(["Usage : rp alias set <nom>"]);
  });

  it("returns invalid configuration when no supported shell is detected", async () => {
    const { output, errors } = captureOutput();

    await expect(runAlias("list", undefined, { output, shell: "unknown" })).resolves.toBe(
      EXIT_CODES.INVALID_CONFIGURATION,
    );
    expect(errors).toEqual(["Shell non reconnu. Shells supportés : Bash, Zsh, Fish, PowerShell."]);
  });

  it("supports dry-run without writing shell config", async () => {
    const { output, logs, errors } = captureOutput();

    await expect(
      runAlias("set", "p", { output, shell: "bash", configPath, dryRun: true }),
    ).resolves.toBe(EXIT_CODES.SUCCESS);
    expect(logs.join("\n")).toContain("Alias à ajouter : p");
    expect(logs.join("\n")).toContain("[--dry-run] Aucune modification appliquée.");
    expect(errors).toEqual([]);
    expect(() => readFileSync(configPath, "utf8")).toThrow();
  });

  it("returns success when listing aliases", async () => {
    const { output, logs } = captureOutput();
    await setAlias(configPath, "bash", "p", false);

    await expect(runAlias("list", undefined, { output, shell: "bash", configPath })).resolves.toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(logs).toEqual(["p"]);
  });
});
