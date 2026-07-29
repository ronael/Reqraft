import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(process.cwd(), "dist/cli.js");
const TEST_CONFIG_HOME = mkdtempSync(path.join(os.tmpdir(), "rp-e2e-"));

function run(args: string): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("node", [CLI, ...parseArgs(args)], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: TEST_CONFIG_HOME,
      APPDATA: TEST_CONFIG_HOME,
      XDG_CONFIG_HOME: TEST_CONFIG_HOME,
    },
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

function parseArgs(args: string): string[] {
  const parsed: string[] = [];
  const regex = /"([^"]*)"|(\S+)/g;
  for (const match of args.matchAll(regex)) {
    parsed.push(match[1] ?? match[2] ?? "");
  }
  return parsed;
}

describe("CLI e2e", () => {
  it("shows help", () => {
    const { stdout, exitCode } = run("--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("rp|reprompt");
  });

  it("shows version", () => {
    const { stdout, exitCode } = run("--version");
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("shows init in help", () => {
    const { stdout, exitCode } = run("--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("init");
  });

  it("reprompts a simple text with mock provider", () => {
    const { stdout, exitCode } = run('"test" --provider mock');
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[mock]");
  });

  it("outputs json", () => {
    const { stdout, exitCode } = run('"test" --provider mock --json');
    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as {
      rewritten: string;
      quality: { status: string; signals: unknown[] };
    };
    expect(json.rewritten).toContain("[mock]");
    expect(json.quality).toEqual({ status: "good", signals: [] });
  });

  it("shows stats when requested", () => {
    const { stdout, exitCode } = run('"test" --provider mock --stats');
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[mock]");
  });

  it("writes stats to stderr when requested", () => {
    const { stdout, stderr, exitCode } = run('"test" --provider mock --stats');
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[mock]");
    expect(stderr).toContain("Stats");
    expect(stderr).toContain("Entrée 10 tokens");
    expect(stderr).toContain("Sortie visible 20 tokens");
    expect(stderr).toContain("Raisonnement non communiqué");
    expect(stderr).toContain("Sortie totale 20 tokens");
    expect(stderr).toContain("Qualité correcte");
  });

  it("writes rewritten prompt to stdout and explanations to stderr", () => {
    const { stdout, stderr, exitCode } = run('"test" --provider mock --explain');
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[mock]");
    expect(stderr).toContain("Modifications");
    expect(stderr).toContain("Mock reformulation applied");
  });

  it("accepts explicit runtime limits", () => {
    const { stdout, stderr, exitCode } = run(
      '"test" --provider mock --timeout 5000 --max-output-tokens 300',
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[mock]");
    expect(stderr).toBe("");
  });

  it("rejects invalid runtime limits with an actionable error", () => {
    const { stdout, stderr, exitCode } = run('"test" --provider mock --timeout 0');
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Le timeout doit être un entier strictement positif.");
  });
});
