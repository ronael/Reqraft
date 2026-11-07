import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clipboardMock = vi.hoisted(() => ({
  read: vi.fn<() => Promise<string>>(),
  write: vi.fn<(text: string) => Promise<void>>(),
}));

vi.mock("clipboardy", () => ({ default: clipboardMock }));

import {
  createCliRepromptInput,
  runReprompt,
  type RepromptCliOptions,
} from "@/apps/cli/commands/reprompt.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { getConfigPath } from "@/config/paths.js";
import type { Config } from "@/config/schema.js";
import { ReqraftError } from "@/core/errors.js";
import type { ProviderRequest, ProviderResponse } from "@/core/types.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { listCredentialProviders } from "@/providers/catalog.js";
import { raiseProviderError } from "@/providers/errors.js";
import { MockProvider } from "@/providers/mock.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

/**
 * `rp <text>` driven end to end through `runReprompt`, against the project's
 * mock provider. Nothing here reaches the network, the clipboard, the keychain
 * or the person's own configuration.
 */

interface RunOutcome {
  code: number;
  stdout: string[];
  stderr: string[];
}

async function run(options: RepromptCliOptions, t?: Translator): Promise<RunOutcome> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const output = {
    log(message: string): void {
      stdout.push(message);
    },
    error(message: string): void {
      stderr.push(message);
    },
  };
  const code = await runReprompt({ provider: "mock", ...options }, output, t);
  return { code, stdout, stderr };
}

interface ModelReply {
  rewritten: string;
  changes?: string[];
  warnings?: string[];
  profile?: string;
  finishReason?: string;
}

/** The mock provider echoes its input; this makes it answer like a real model. */
function mockModelReply(reply: ModelReply): void {
  vi.spyOn(MockProvider.prototype, "generate").mockResolvedValue({
    text: JSON.stringify({
      rewritten: reply.rewritten,
      profile: reply.profile,
      changes: reply.changes ?? [],
      warnings: reply.warnings ?? [],
    }),
    usage: { inputTokens: 12, outputTokens: 34, visibleOutputTokens: 34 },
    model: "mock-model",
    finishReason: reply.finishReason ?? "stop",
  });
}

function mockProviderFailure(error: unknown): void {
  vi.spyOn(MockProvider.prototype, "generate").mockRejectedValue(error);
}

/** The error a real adapter raises on an HTTP failure, built by the same code. */
function httpFailure(status: number, body: string): unknown {
  try {
    raiseProviderError("Mock", new Response(body, { status }), body);
  } catch (error) {
    return error;
  }
}

/** A provider that never answers: only the request's own signal ends the wait. */
async function neverAnswers(request: ProviderRequest): Promise<ProviderResponse> {
  if (request.signal) await once(request.signal, "abort");
  throw new Error("The operation was aborted.");
}

function replaceStdin(stream: PassThrough): void {
  vi.spyOn(process, "stdin", "get").mockReturnValue(stream as unknown as typeof process.stdin);
}

/** What `echo "…" | rp` hands the command. */
function pipeStdin(text: string): void {
  const stdin = new PassThrough();
  stdin.end(text);
  replaceStdin(stdin);
}

function useInteractiveStdin(): void {
  replaceStdin(Object.assign(new PassThrough(), { isTTY: true }));
}

/** A clipboard that gives back what was written to it, like the system one. */
function fakeClipboard(): () => string {
  let content = "";
  clipboardMock.write.mockImplementation((text) => {
    content = text;
    return Promise.resolve();
  });
  clipboardMock.read.mockImplementation(() => Promise.resolve(content));
  return () => content;
}

async function writeUserConfig(content: string): Promise<string> {
  const file = getConfigPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return file;
}

/**
 * The configuration is read from an empty temporary home on every platform.
 * API keys come from the environment, which always wins over the system
 * keychain, so the keychain is never queried. The terminal is a plain one: no
 * colour, ASCII separators.
 */
function isolateEnvironment(home: string): void {
  for (const name of ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "APPDATA"]) {
    vi.stubEnv(name, home);
  }
  for (const provider of listCredentialProviders()) {
    vi.stubEnv(provider.apiKeyEnvName, "test-value-never-sent");
  }
  vi.stubEnv("NO_COLOR", "1");
  vi.stubEnv("TERM", "dumb");
  for (const name of ["WT_SESSION", "TERM_PROGRAM"]) {
    vi.stubEnv(name, undefined);
  }
}

const RULE = "-".repeat(40);
const WARNING = "La page visée reste à confirmer.";
const REVIEWED_PROMPT = "Corrige le titre de la page d'accueil.";
const NETWORK_MESSAGE =
  "Erreur : Mock est inaccessible. Vérifie la connexion réseau et la base URL du provider, puis réessaie.";

/** The stats block of a run. The tests that print it freeze `Date`, so a run lasts 0 ms. */
function stats(lines: { input: number; output: number; quality?: string }): string {
  return [
    "Stats",
    "Durée 0 ms",
    `Entrée ${String(lines.input)} tokens`,
    `Sortie visible ${String(lines.output)} tokens`,
    "Raisonnement non communiqué",
    `Sortie totale ${String(lines.output)} tokens`,
    "Coût estimé non disponible",
    "Provider mock · Modèle mock-model",
    ...(lines.quality === undefined ? [] : [lines.quality]),
  ].join("\n");
}

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), "rp-reprompt-command-"));
  isolateEnvironment(workDir);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  clipboardMock.read.mockReset();
  clipboardMock.write.mockReset();
  await rm(workDir, { recursive: true, force: true });
});

describe("rp <text>: where the request comes from", () => {
  it("sends the text argument and prints only the rewritten prompt on stdout", async () => {
    const { code, stdout, stderr } = await run({ text: "corrige le formulaire sur mobile" });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual(["[mock] corrige le formulaire sur mobile"]);
    expect(stderr).toEqual([]);
  });

  it("reads the request from --file, without its surrounding blank lines", async () => {
    const file = path.join(workDir, "demande.md");
    await writeFile(file, "\n  ajoute un bouton retour  \n\n", "utf8");

    const { code, stdout } = await run({ file });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual(["[mock] ajoute un bouton retour"]);
  });

  it("names a --file it cannot read", async () => {
    const file = path.join(workDir, "absent.md");

    const { code, stdout, stderr } = await run({ file });

    expect(code).toBe(EXIT_CODES.INVALID_INPUT);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([`Erreur : Impossible de lire le fichier ${file}.`]);
  });

  it("reads the request from the clipboard with --clipboard", async () => {
    clipboardMock.read.mockResolvedValue("  résume ce ticket \n");

    const { code, stdout } = await run({ clipboard: true });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual(["[mock] résume ce ticket"]);
  });

  it("reports a clipboard it cannot read", async () => {
    clipboardMock.read.mockRejectedValue(new Error("no clipboard utility installed"));

    const { code, stdout, stderr } = await run({ clipboard: true });

    expect(code).toBe(EXIT_CODES.GENERAL_ERROR);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["Erreur : Impossible de lire le presse-papiers."]);
  });

  it("prefers --clipboard, then --file, over the text argument", async () => {
    const file = path.join(workDir, "demande.md");
    await writeFile(file, "depuis le fichier", "utf8");
    clipboardMock.read.mockResolvedValue("depuis le presse-papiers");

    const fromClipboard = await run({ text: "depuis l'argument", file, clipboard: true });
    const fromFile = await run({ text: "depuis l'argument", file });

    expect(fromClipboard.stdout).toEqual(["[mock] depuis le presse-papiers"]);
    expect(fromFile.stdout).toEqual(["[mock] depuis le fichier"]);
  });

  it("reads piped stdin when no other source is given", async () => {
    pipeStdin("traduis la page d'accueil\n");

    const { code, stdout } = await run({});

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual(["[mock] traduis la page d'accueil"]);
  });

  it.each<{
    source: string;
    prepare: () => RepromptCliOptions | Promise<RepromptCliOptions>;
  }>([
    {
      source: "empty piped stdin",
      prepare: () => {
        pipeStdin("  \n");
        return {};
      },
    },
    {
      source: "an interactive terminal and nothing else",
      prepare: () => {
        useInteractiveStdin();
        return {};
      },
    },
    {
      source: "an empty clipboard",
      prepare: () => {
        clipboardMock.read.mockResolvedValue(" \n");
        return { clipboard: true };
      },
    },
    {
      source: "an empty file",
      prepare: async () => {
        const file = path.join(workDir, "vide.md");
        await writeFile(file, "\n", "utf8");
        return { file };
      },
    },
  ])("reports a missing request, without waiting, given $source", async ({ prepare }) => {
    const generate = vi.spyOn(MockProvider.prototype, "generate");

    const { code, stdout, stderr } = await run(await prepare());

    expect(code).toBe(EXIT_CODES.INVALID_INPUT);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["Aucune entrée fournie. Utilisez rp --help pour voir les options."]);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("rp <text>: secrets", () => {
  const request = "Déploie sur staging avec API_KEY=abc123xyz puis préviens l'équipe";
  const githubLikeValue = `ghp_${"x".repeat(36)}`;

  it("refuses to send a detected secret and names each kind found", async () => {
    const generate = vi.spyOn(MockProvider.prototype, "generate");

    const { code, stdout, stderr } = await run({
      text: `Le jeton ${githubLikeValue} et API_KEY=abc123xyz ne marchent plus`,
    });

    expect(code).toBe(EXIT_CODES.SECRET_DETECTED);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      "Un secret potentiel a été détecté dans le texte.",
      "  - GitHub token",
      "  - generic secret",
      "Utilisez --redact-secrets pour masquer automatiquement ou --force pour continuer.",
    ]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("sends the text unchanged with --force", async () => {
    const { code, stdout, stderr } = await run({ text: request, force: true });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual([`[mock] ${request}`]);
    expect(stderr).toEqual([]);
  });

  it("masks the secret before the text leaves with --redact-secrets", async () => {
    const { code, stdout, stderr } = await run({ text: request, redactSecrets: true });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual(["[mock] Déploie sur staging avec [REDACTED] puis préviens l'équipe"]);
    expect(stderr).toEqual([]);
  });

  it("masks each of several secrets and keeps the text between them", async () => {
    const { stdout } = await run({
      text: `Le jeton ${githubLikeValue} et API_KEY=abc123xyz ne marchent plus`,
      redactSecrets: true,
    });

    expect(stdout).toEqual(["[mock] Le jeton [REDACTED] et [REDACTED] ne marchent plus"]);
  });

  // An Anthropic or OpenAI key also matches the 40-character "AWS secret key"
  // pattern, so the two matches overlap.
  it.each([
    { kind: "Anthropic", key: `sk-ant-${"x".repeat(40)}` },
    { kind: "OpenAI", key: `sk-${"x".repeat(48)}` },
  ])("keeps the words that follow an $kind key when --redact-secrets masks it", async ({ key }) => {
    const { code, stdout } = await run({
      text: `Use ${key} in the deploy script and keep the rest`,
      redactSecrets: true,
    });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual(["[mock] Use [REDACTED] in the deploy script and keep the rest"]);
  });

  it("speaks the UI locale it is given", async () => {
    const { code, stderr } = await run({ text: request }, createTranslator("en"));

    expect(code).toBe(EXIT_CODES.SECRET_DETECTED);
    expect(stderr).toEqual([
      "A potential secret was detected in the text.",
      "  - generic secret",
      "Use --redact-secrets to redact it automatically or --force to continue.",
    ]);
  });
});

describe("rp <text>: --json", () => {
  it("prints one versioned envelope on stdout and nothing on stderr, whatever else is asked", async () => {
    const { code, stdout, stderr } = await run({
      text: "liste les dépendances",
      json: true,
      diff: true,
      explain: true,
      stats: true,
    });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout.join("\n")) as unknown).toMatchObject({
      schemaVersion: 1,
      ok: true,
      result: {
        original: "liste les dépendances",
        rewritten: "[mock] liste les dépendances",
        provider: "mock",
        model: "mock-model",
        changes: ["Mock reformulation applied"],
        quality: { status: "good" },
        usage: { inputTokens: 10, outputTokens: 20, visibleOutputTokens: 20 },
      },
    });
    expect(stderr).toEqual([]);
  });

  it("reports an invalid option as an error envelope with its exit code", async () => {
    const { code, stdout, stderr } = await run({
      text: "corrige le titre",
      json: true,
      timeout: "bientôt",
    });

    expect(code).toBe(EXIT_CODES.INVALID_INPUT);
    expect(JSON.parse(stdout.join("\n")) as unknown).toEqual({
      schemaVersion: 1,
      ok: false,
      error: {
        code: "runtime.option_invalid",
        params: { option: "timeout", expected: "positive_integer" },
        exitCode: EXIT_CODES.INVALID_INPUT,
      },
    });
    expect(stderr).toEqual([]);
  });

  it("reports a provider failure as an error envelope, without the provider's answer", async () => {
    mockProviderFailure(httpFailure(401, '{"error":"unknown x-api-key"}'));

    const { code, stdout, stderr } = await run({ text: "corrige le titre", json: true });

    expect(code).toBe(EXIT_CODES.AUTHENTICATION);
    expect(JSON.parse(stdout.join("\n")) as unknown).toEqual({
      schemaVersion: 1,
      ok: false,
      error: {
        code: "provider.authentication_failed",
        params: { provider: "Mock", httpStatus: 401 },
        exitCode: EXIT_CODES.AUTHENTICATION,
      },
    });
    expect(stderr).toEqual([]);
  });

  it("reports a missing request and a refused secret as JSON error envelopes", async () => {
    const generate = vi.spyOn(MockProvider.prototype, "generate");
    pipeStdin("  \n");

    const missing = await run({ json: true });
    const refused = await run({
      text: `Le jeton ghp_${"x".repeat(36)} et API_KEY=abc123xyz ne marchent plus`,
      json: true,
    });

    expect(missing.code).toBe(EXIT_CODES.INVALID_INPUT);
    expect(JSON.parse(missing.stdout.join("\n")) as unknown).toEqual({
      schemaVersion: 1,
      ok: false,
      error: { code: "input.missing", exitCode: EXIT_CODES.INVALID_INPUT },
    });
    expect(missing.stderr).toEqual([]);
    expect(refused.code).toBe(EXIT_CODES.SECRET_DETECTED);
    expect(JSON.parse(refused.stdout.join("\n")) as unknown).toEqual({
      schemaVersion: 1,
      ok: false,
      error: {
        code: "input.secret_detected",
        params: { types: ["GitHub token", "generic secret"] },
        exitCode: EXIT_CODES.SECRET_DETECTED,
      },
    });
    expect(refused.stderr).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("rp <text>: what is printed around the prompt", () => {
  it("--diff prints a line diff of the request and the prompt instead of the prompt", async () => {
    const { code, stdout, stderr } = await run({
      text: "Corrige le titre\nGarde le style",
      diff: true,
    });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual(["- Corrige le titre\n+ [mock] Corrige le titre\n  Garde le style"]);
    expect(stderr).toEqual([]);
  });

  it.each([
    {
      change: "splits the request over more lines",
      text: "corrige le titre",
      rewritten: "Corrige le titre.\nNe change pas le style.",
      lines: ["- corrige le titre", "+ Corrige le titre.", "+ Ne change pas le style."],
    },
    {
      change: "merges the request into fewer lines",
      text: "corrige le titre\net le sous-titre",
      rewritten: "Corrige le titre et le sous-titre.",
      lines: ["- corrige le titre", "- et le sous-titre", "+ Corrige le titre et le sous-titre."],
    },
  ])("--diff shows every line when the prompt $change", async ({ text, rewritten, lines }) => {
    mockModelReply({ rewritten });

    const { stdout } = await run({ text, diff: true });

    expect(stdout.join("\n").split("\n")).toEqual(expect.arrayContaining(lines));
  });

  it("--explain keeps the prompt on stdout and lists the changes on stderr", async () => {
    const { stdout, stderr } = await run({ text: "corrige le titre", explain: true });

    expect(stdout).toEqual(["[mock] corrige le titre"]);
    expect(stderr).toEqual(["Modifications :\n> Mock reformulation applied"]);
  });

  it("--explain lists quality warnings with the changes rather than in a separate block", async () => {
    mockModelReply({
      rewritten: REVIEWED_PROMPT,
      changes: ["Page visée précisée"],
      warnings: [WARNING],
    });

    const { stdout, stderr } = await run({ text: "corrige le titre", explain: true });

    expect(stdout).toEqual([REVIEWED_PROMPT]);
    expect(stderr).toEqual([
      `Modifications :\n> Page visée précisée\n\nAvertissements :\n! ${WARNING}`,
    ]);
  });

  it("prints quality warnings on stderr, after the prompt", async () => {
    mockModelReply({ rewritten: REVIEWED_PROMPT, warnings: [WARNING] });

    const { code, stdout, stderr } = await run({ text: "corrige le titre" });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual([REVIEWED_PROMPT]);
    expect(stderr).toEqual(["", `${RULE}\nQualité à vérifier\n! ${WARNING}`]);
  });

  it("still shows quality warnings when --diff and --explain are combined", async () => {
    mockModelReply({
      rewritten: REVIEWED_PROMPT,
      changes: ["Page visée précisée"],
      warnings: [WARNING],
    });

    const { stdout, stderr } = await run({ text: "corrige le titre", diff: true, explain: true });

    expect(stdout).toEqual([`- corrige le titre\n+ ${REVIEWED_PROMPT}`]);
    expect(stderr).toEqual([
      `Modifications :\n> Page visée précisée\n\nAvertissements :\n! ${WARNING}`,
    ]);
  });

  it("--stats prints the usage of the run on stderr", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const { stdout, stderr } = await run({ text: "corrige le titre", stats: true });

    expect(stdout).toEqual(["[mock] corrige le titre"]);
    expect(stderr).toEqual(["", stats({ input: 10, output: 20, quality: "Qualité correcte" })]);
  });

  it("--stats leaves the quality verdict to the warning block when there is one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mockModelReply({ rewritten: REVIEWED_PROMPT, warnings: [WARNING] });

    const { stderr } = await run({ text: "corrige le titre", stats: true });

    expect(stderr).toEqual([
      "",
      `${RULE}\nQualité à vérifier\n! ${WARNING}`,
      "",
      stats({ input: 12, output: 34 }),
    ]);
  });

  it("--stats keeps the quality verdict when --explain lists the warnings", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mockModelReply({
      rewritten: REVIEWED_PROMPT,
      changes: ["Page visée précisée"],
      warnings: [WARNING],
    });

    const { stderr } = await run({ text: "corrige le titre", explain: true, stats: true });

    expect(stderr).toEqual([
      `Modifications :\n> Page visée précisée\n\nAvertissements :\n! ${WARNING}`,
      "",
      stats({ input: 12, output: 34, quality: "Qualité à vérifier" }),
    ]);
  });

  it("prints the stats without --stats when the configuration asks for them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await writeUserConfig(JSON.stringify({ showStats: true }));

    const { stderr } = await run({ text: "corrige le titre" });

    expect(stderr).toEqual(["", stats({ input: 10, output: 20, quality: "Qualité correcte" })]);
  });

  it("--copy puts the rewritten prompt on the clipboard and says so on stderr", async () => {
    const clipboardContent = fakeClipboard();

    const { code, stdout, stderr } = await run({ text: "corrige le titre", copy: true });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(clipboardContent()).toBe("[mock] corrige le titre");
    expect(stdout).toEqual(["[mock] corrige le titre"]);
    expect(stderr).toEqual(["Résultat copié dans le presse-papiers."]);
  });

  it("keeps the printed prompt when the clipboard cannot be written", async () => {
    clipboardMock.write.mockRejectedValue(new Error("no clipboard utility installed"));

    const { code, stdout, stderr } = await run({ text: "corrige le titre", copy: true });

    expect(code).toBe(EXIT_CODES.GENERAL_ERROR);
    expect(stdout).toEqual(["[mock] corrige le titre"]);
    expect(stderr).toEqual(["Erreur : Impossible d'écrire dans le presse-papiers."]);
  });

  it("--verbose names the profile the model chose", async () => {
    mockModelReply({ rewritten: "Analyse la trace d'erreur.", profile: "debug" });

    const { stdout, stderr } = await run({ text: "analyse cette erreur", verbose: true });

    expect(stdout).toEqual(["Analyse la trace d'erreur."]);
    expect(stderr).toEqual(["Profil détecté : debug"]);
  });
});

describe("rp <text>: --fail-on-quality", () => {
  it("exits successfully when the quality is good", async () => {
    const { code, stdout } = await run({ text: "corrige le titre", failOnQuality: true });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toEqual(["[mock] corrige le titre"]);
  });

  it.each([
    { verdict: "to review", reply: { warnings: [WARNING] }, heading: "Qualité à vérifier" },
    { verdict: "risky", reply: { finishReason: "length" }, heading: "Qualité risquée" },
  ])(
    "exits with the quality code once a prompt $verdict is printed",
    async ({ reply, heading }) => {
      mockModelReply({ rewritten: REVIEWED_PROMPT, ...reply });

      const { code, stdout, stderr } = await run({ text: "corrige le titre", failOnQuality: true });

      expect(code).toBe(EXIT_CODES.QUALITY_REVIEW);
      expect(stdout).toEqual([REVIEWED_PROMPT]);
      expect(stderr.join("\n")).toContain(heading);
    },
  );
});

describe("rp <text>: options and configuration", () => {
  it.each<{ problem: string; options: RepromptCliOptions; message: string }>([
    {
      problem: "a timeout that is not a number",
      options: { timeout: "bientôt" },
      message: "Le timeout doit être un entier strictement positif.",
    },
    {
      problem: "a zero timeout",
      options: { timeout: "0" },
      message: "Le timeout doit être un entier strictement positif.",
    },
    {
      problem: "a fractional timeout",
      options: { timeout: "1.5" },
      message: "Le timeout doit être un entier strictement positif.",
    },
    {
      problem: "a negative output limit",
      options: { maxOutputTokens: "-200" },
      message: "La limite de sortie doit être un entier strictement positif.",
    },
    {
      problem: "an unknown level",
      options: { level: "maximal" },
      message: "Niveau invalide : maximal. Choisissez minimal, standard ou complete.",
    },
    {
      problem: "an unknown profile",
      options: { profile: "poesie" },
      message: "Profil inconnu : poesie.",
    },
  ])("rejects $problem before anything is sent", async ({ options, message }) => {
    const generate = vi.spyOn(MockProvider.prototype, "generate");

    const { code, stdout, stderr } = await run({ text: "corrige le titre", ...options });

    expect(code).toBe(EXIT_CODES.INVALID_INPUT);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([`Erreur : ${message}`]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("gives the provider the output limit asked with --max-output-tokens", async () => {
    const generate = vi.spyOn(MockProvider.prototype, "generate");

    const { code } = await run({
      text: "corrige le titre",
      timeout: "45000",
      maxOutputTokens: "300",
    });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(generate.mock.calls[0]?.[0].maxOutputTokens).toBe(300);
  });

  it("names a configuration file it cannot parse", async () => {
    const file = await writeUserConfig("{ not json");

    const { code, stdout, stderr } = await run({ text: "corrige le titre" });

    expect(code).toBe(EXIT_CODES.INVALID_CONFIGURATION);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([`Erreur : Le fichier de configuration est invalide : ${file}.`]);
  });

  it("keeps an explicit output language and lets auto cancel a configured one", () => {
    const config: Config = { ...DEFAULT_CONFIG, outputLanguage: "de" };

    expect(createCliRepromptInput("x", config, {}, {}).outputLanguage).toBe("de");
    expect(createCliRepromptInput("x", config, { outputLanguage: "en" }, {}).outputLanguage).toBe(
      "en",
    );
    expect(
      createCliRepromptInput("x", config, { outputLanguage: "auto" }, {}).outputLanguage,
    ).toBeUndefined();
  });

  it("keeps the configured model when --provider repeats the configured provider", () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
    };

    expect(createCliRepromptInput("x", config, { provider: "openai" }, {}).requestedModel).toBe(
      "gpt-5-mini",
    );
  });
});

describe("rp <text>: provider failures", () => {
  it.each([
    {
      status: 401,
      exitCode: EXIT_CODES.AUTHENTICATION,
      message:
        "La clé API mock a été refusée. Lance « rp auth login mock » ou vérifie la variable d’environnement correspondante.",
    },
    {
      status: 429,
      exitCode: EXIT_CODES.PROVIDER_NETWORK,
      message: "mock limite temporairement les requêtes. Patiente quelques secondes puis régénère.",
    },
  ])(
    "turns HTTP $status into advice, without the provider's answer",
    async ({ status, exitCode, message }) => {
      mockProviderFailure(httpFailure(status, '{"error":"unknown x-api-key"}'));

      const { code, stdout, stderr } = await run({ text: "corrige le titre" });

      expect(code).toBe(exitCode);
      expect(stdout).toEqual([]);
      expect(stderr).toEqual([`Erreur : ${message}`]);
    },
  );

  it("names an unreachable provider, with the technical detail only under --verbose", async () => {
    mockProviderFailure(
      new ReqraftError("provider.request_failed", EXIT_CODES.PROVIDER_NETWORK, {
        params: { provider: "Mock" },
        detail: "getaddrinfo ENOTFOUND api.example.invalid",
      }),
    );

    const quiet = await run({ text: "corrige le titre" });
    const verbose = await run({ text: "corrige le titre", verbose: true });

    expect(quiet.code).toBe(EXIT_CODES.PROVIDER_NETWORK);
    expect(quiet.stderr).toEqual([NETWORK_MESSAGE]);
    expect(verbose.stderr).toEqual([NETWORK_MESSAGE, "getaddrinfo ENOTFOUND api.example.invalid"]);
  });

  it("stops waiting for the provider after --timeout milliseconds", async () => {
    vi.spyOn(MockProvider.prototype, "generate").mockImplementation(neverAnswers);

    const { code, stdout, stderr } = await run({ text: "corrige le titre", timeout: "20" });

    expect(code).toBe(EXIT_CODES.PROVIDER_NETWORK);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["Erreur : Le provider n’a pas répondu dans le délai de 20 ms."]);
  });

  it("names a provider it does not support", async () => {
    const { code, stderr } = await run({ text: "corrige le titre", provider: "nope" });

    expect(code).toBe(EXIT_CODES.INVALID_CONFIGURATION);
    expect(stderr).toEqual(["Erreur : Provider non supporté : nope."]);
  });

  it("falls back to a generic message for an unexpected failure", async () => {
    mockProviderFailure(new Error("socket hang up"));

    const { code, stdout, stderr } = await run({ text: "corrige le titre" });

    expect(code).toBe(EXIT_CODES.GENERAL_ERROR);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["Erreur : Une erreur inattendue est survenue."]);
  });

  it("names the configured provider when a key is rejected and --provider was not given", async () => {
    await writeUserConfig(JSON.stringify({ defaultProvider: "mock" }));
    mockProviderFailure(httpFailure(401, '{"error":"unknown x-api-key"}'));

    const { code, stderr } = await run({ text: "corrige le titre", provider: undefined });

    expect(code).toBe(EXIT_CODES.AUTHENTICATION);
    expect(stderr).toEqual([
      "Erreur : La clé API mock a été refusée. Lance « rp auth login mock » ou vérifie la variable d’environnement correspondante.",
    ]);
  });
});
