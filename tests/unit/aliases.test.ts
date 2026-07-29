import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listAliases, removeAlias, setAlias } from "../../src/aliases/manager.js";

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
