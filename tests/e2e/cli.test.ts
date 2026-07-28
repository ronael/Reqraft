import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(process.cwd(), "dist/cli.js");
const TEST_CONFIG_HOME = mkdtempSync(path.join(os.tmpdir(), "rp-e2e-"));

function run(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: "utf8",
      env: {
        ...process.env,
        XDG_CONFIG_HOME: TEST_CONFIG_HOME,
      },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
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
    const json = JSON.parse(stdout) as { rewritten: string };
    expect(json.rewritten).toContain("[mock]");
  });

  it("shows stats when requested", () => {
    const { stdout, exitCode } = run('"test" --provider mock --stats');
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[mock]");
    expect(stdout).toContain("Stats");
    expect(stdout).toContain("Tokens");
    expect(stdout).toContain("10 entrée");
    expect(stdout).toContain("20 sortie");
  });
});
