import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listCredentialProviders, listProviderDefinitions } from "../../src/providers/catalog.js";
import { listProfiles } from "../../src/profiles/registry.js";
import { EXIT_CODES } from "../../src/utils/exit-codes.js";

const CLI = path.resolve(process.cwd(), "dist/cli.js");
const TEST_CONFIG_HOME = mkdtempSync(path.join(os.tmpdir(), "rp-e2e-"));

/**
 * Environment for the CLI under test.
 *
 * Config is redirected to a throwaway home, and every provider key is removed:
 * the suite runs on the mock provider, so a real — or placeholder — key in the
 * developer's shell must never reach the CLI. Reqraft rejects placeholder keys
 * on startup, which would otherwise fail the suite on that machine only.
 */
function testEnv(): NodeJS.ProcessEnv {
  const providerKeys = new Set<string>(
    listCredentialProviders().map((provider) => provider.apiKeyEnvName),
  );
  const withoutProviderKeys = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !providerKeys.has(name)),
  );

  return {
    ...withoutProviderKeys,
    HOME: TEST_CONFIG_HOME,
    APPDATA: TEST_CONFIG_HOME,
    XDG_CONFIG_HOME: TEST_CONFIG_HOME,
    REQRAFT_UI_LOCALE: "fr",
  };
}

function run(args: string): { stdout: string; stderr: string; exitCode: number } {
  // process.execPath is absolute and pins the child to the very interpreter
  // running the suite, instead of whatever "node" PATH happens to resolve to.
  const result = spawnSync(process.execPath, [CLI, ...parseArgs(args)], {
    encoding: "utf8",
    env: testEnv(),
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

/** Invocations that must succeed and print an identifying marker on stdout. */
const stdoutCases: { name: string; args: string; expected: string | RegExp }[] = [
  { name: "shows help", args: "--help", expected: "rp|reprompt" },
  { name: "shows version", args: "--version", expected: /^\d+\.\d+\.\d+/ },
  { name: "shows init in help", args: "--help", expected: "init" },
  {
    name: "reprompts a simple text with mock provider",
    args: '"test" --provider mock',
    expected: "[mock]",
  },
];

describe("CLI e2e", () => {
  it.each(stdoutCases)("$name", ({ args, expected }) => {
    const { stdout, exitCode } = run(args);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(expected);
  });

  it("outputs json", () => {
    const { stdout, exitCode } = run('"test" --provider mock --json');
    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout) as {
      schemaVersion: number;
      ok: boolean;
      result: { rewritten: string; quality: { status: string; signals: unknown[] } };
    };
    expect(json.schemaVersion).toBe(1);
    expect(json.ok).toBe(true);
    expect(json.result.rewritten).toContain("[mock]");
    // No `--profile` flag: this runs on the default, `auto`. The mock
    // provider never reports a `profile` field, so `auto` always falls back
    // to `clean` here — observable as an `info`-severity signal (does not
    // change `status`, see core/engine.ts#resolveResultProfile), not as
    // `signals: []`.
    expect(json.result.quality).toEqual({
      status: "good",
      signals: [{ code: "profile_detection_fallback", severity: "info" }],
    });
  });

  it("keeps JSON content identical across UI locales", () => {
    const en = run('"test" --provider mock --json --ui-locale en');
    const fr = run('"test" --provider mock --json --ui-locale fr');

    expect(en.exitCode).toBe(0);
    expect(fr.exitCode).toBe(0);
    expect(en.stderr).toBe("");
    expect(fr.stderr).toBe("");
    const enJson = JSON.parse(en.stdout) as { result: { latencyMs?: number } };
    const frJson = JSON.parse(fr.stdout) as { result: { latencyMs?: number } };
    delete enJson.result.latencyMs;
    delete frJson.result.latencyMs;
    expect(enJson).toEqual(frJson);
  });

  it("keeps structured JSON errors byte-identical across UI locales", () => {
    const en = run('"test" --provider mock --timeout 0 --json --ui-locale en');
    const fr = run('"test" --provider mock --timeout 0 --json --ui-locale fr');

    expect(en.exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(fr.exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(en.stdout).toBe(fr.stdout);
    expect(en.stdout).toContain('"code": "runtime.option_invalid"');
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
    expect(exitCode).toBe(EXIT_CODES.INVALID_INPUT);
    expect(stdout).toBe("");
    expect(stderr).toContain("Le timeout doit être un entier strictement positif.");
  });

  it("rejects detected secrets before sending the request", () => {
    const fakeSecret = "sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { stdout, stderr, exitCode } = run(`"${fakeSecret}" --provider mock`);

    expect(exitCode).toBe(EXIT_CODES.SECRET_DETECTED);
    expect(stdout).toBe("");
    expect(stderr).toContain("Un secret potentiel a été détecté");
  });

  it("rejects invalid boolean config values", () => {
    const { stdout, stderr, exitCode } = run("config set showStats yes");
    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("Valeur invalide pour showStats");
  });

  it("lists providers from the public catalog", () => {
    const { stdout, exitCode } = run("providers");
    expect(exitCode).toBe(0);

    for (const definition of listProviderDefinitions()) {
      expect(stdout).toContain(definition.id);
      expect(stdout).toContain(definition.label);
    }
  });

  it("lists profiles from the profile registry", () => {
    const { stdout, exitCode } = run("profiles");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("auto");

    for (const profile of listProfiles()) {
      expect(stdout).toContain(profile.id);
      expect(stdout).toContain(profile.name);
    }
  });

  it("groups models with provider labels from the public catalog", () => {
    const { stdout, exitCode } = run("models");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("openai — OpenAI");
    expect(stdout).toContain("anthropic — Anthropic");
    expect(stdout).toContain("gpt-4.1-mini");
  });
});
