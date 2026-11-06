import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFirstRunSetup } from "@/apps/cli/commands/first-run.js";
import { configPath, loadUserConfig } from "@/config/loader.js";
import { REPROMPT_POLICY } from "@/core/reprompt-policy.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { getFallbackModelForProvider } from "@/models/presets.js";
import { createProvider } from "@/providers/registry.js";

vi.mock("node:child_process", () => ({
  // `rp init` looks a key missing from the environment up in the system
  // keychain. The tests never reach the real one: every lookup finds nothing,
  // whatever the platform.
  execFile: (...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error) => void;
    callback(new Error("No keychain in tests."));
  },
  spawn: () => {
    throw new Error("No child process in tests.");
  },
}));

/** What the person types: a fixed answer, or one read off the question on screen. */
type Answer = string | ((screen: string) => string);

interface SetupSession {
  /** Everything written to the terminal, questions included. */
  transcript: string;
  /** Each question, as displayed. */
  prompts: string[];
  input: PassThrough;
}

interface RunningSetup {
  session: SetupSession;
  /** Settles with the setup; rejects on a question the script did not plan for. */
  finished: Promise<void>;
}

interface SetupOptions {
  env?: NodeJS.ProcessEnv;
  reset?: boolean;
  shell?: string;
  t?: Translator;
}

const ENTER = "";
const YES = "o";
const NO = "n";

function menuNumber(screen: string, matches: (label: string) => boolean, wanted: string): string {
  for (const line of screen.split("\n")) {
    // A menu entry reads "  2. Label", or "> 1. Label" for the proposed one.
    const entry = /^\D*(\d+)\. /.exec(line);
    if (entry?.[1] && matches(line.slice(entry[0].length))) return entry[1];
  }
  throw new Error(`No menu entry for "${wanted}" in:\n${screen}`);
}

/** Chooses the menu entry labelled `label`, as a person reading the screen would. */
function pick(label: string): Answer {
  return (screen) => menuNumber(screen, (entry) => entry === label, label);
}

/** Chooses a model of the list by its identifier. */
function pickModel(id: string): Answer {
  return (screen) => menuNumber(screen, (entry) => entry.includes(`(${id})`), id);
}

const SAVE = pick("Enregistrer la configuration");
const CHANGE = pick("Modifier un choix");
const CANCEL = pick("Annuler");
/** Profile, level, auto copy, interface language, output language, streaming, timeout. */
const KEEP_PREFERENCES: readonly Answer[] = Array<Answer>(7).fill(ENTER);
/** A local Ollama server: default id and URL, no key variable, no headers. */
const LOCAL_OLLAMA: readonly Answer[] = [
  pick("Serveur local compatible OpenAI"),
  ENTER, // internal id
  "Ollama",
  ENTER, // base URL
  ENTER, // no key variable
  ENTER, // no custom headers
  "llama3.2",
];

/**
 * Starts `rp init` on in-memory streams and answers each question with the
 * next scripted answer, the way a person at the keyboard would.
 */
function startSetup(answers: readonly Answer[], options: SetupOptions = {}): RunningSetup {
  const pending = [...answers];
  const session: SetupSession = { transcript: "", prompts: [], input: new PassThrough() };
  let screen = "";
  let failScript: (error: Error) => void;
  const scriptFailure = new Promise<never>((_resolve, reject) => {
    failScript = reject;
  });

  const answerQuestion = (): void => {
    const next = pending.shift();
    if (next === undefined) {
      failScript(new Error(`Unscripted question:\n${screen}`));
      return;
    }
    try {
      const typed = typeof next === "function" ? next(screen) : next;
      setImmediate(() => session.input.write(`${typed}\n`));
    } catch (error) {
      failScript(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const output = new Writable({
    write(chunk: Buffer, _encoding, done: () => void): void {
      const text = chunk.toString("utf8");
      session.transcript += text;
      screen += text;
      // Every message ends its line; only a question waits on the same line.
      if (!text.endsWith("\n")) {
        session.prompts.push(text);
        answerQuestion();
        screen = "";
      }
      done();
    },
  });

  const setup = runFirstRunSetup(
    {
      input: session.input,
      output,
      env: options.env ?? {},
      shell: options.shell,
      reset: options.reset,
    },
    options.t,
  );
  const finished = Promise.race([setup, scriptFailure]).then(() => {
    if (pending.length > 0) {
      throw new Error(`The setup ended with ${String(pending.length)} scripted answers left.`);
    }
  });
  return { session, finished };
}

async function runSetup(
  answers: readonly Answer[],
  options: SetupOptions = {},
): Promise<SetupSession> {
  const { session, finished } = startSetup(answers, options);
  await finished;
  return session;
}

function occurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

async function readSavedConfig(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(configPath(), "utf8")) as Record<string, unknown>;
}

async function writeExistingConfig(content: string): Promise<void> {
  await mkdir(path.dirname(configPath()), { recursive: true });
  await writeFile(configPath(), content, "utf8");
}

function chatCompletion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
}

const ANTHROPIC_KEY = "anthropic-test-key";
const ANTHROPIC_ENV = { ANTHROPIC_API_KEY: ANTHROPIC_KEY };

/** What a setup that keeps every proposed value saves. */
const DEFAULT_CHOICES = {
  defaultProvider: "anthropic",
  defaultModel: getFallbackModelForProvider("anthropic"),
  defaultProfile: "auto",
  defaultLevel: "standard",
  copyAfterGeneration: false,
  stream: true,
  timeoutMs: 30000,
  showChanges: false,
  showStats: false,
  fidelityMode: "balanced",
  telemetry: false,
  uiLocale: "auto",
  outputLanguage: "auto",
};

/** A configuration saved earlier, including settings `rp init` never asks about. */
const EXISTING_CONFIG = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-5",
  defaultProfile: "writing",
  defaultLevel: "complete",
  copyAfterGeneration: true,
  stream: false,
  timeoutMs: 45000,
  maxOutputTokens: 900,
  showChanges: true,
  showStats: true,
  fidelityMode: "strict",
  telemetry: false,
  uiLocale: "fr",
  outputLanguage: "de",
  desktopShortcuts: { capture: "CommandOrControl+Shift+R" },
};

/** Modifying EXISTING_CONFIG and keeping every saved answer. */
const KEEP_EXISTING_ANSWERS: readonly Answer[] = [
  pick("Modifier la configuration existante"),
  ENTER, // provider, as saved
  ENTER, // model, as saved
  ENTER, // profile, as saved
  ENTER, // level, as saved
  ENTER, // auto copy, as saved
  ENTER, // interface language, as saved
  ENTER, // "another language", as saved
  ENTER, // that language, as saved
  ENTER, // streaming, as saved
  ENTER, // timeout, as saved
];

let home = "";

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "reqraft-init-"));
  // Each platform reads its configuration directory from one of these.
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("APPDATA", path.join(home, "AppData", "Roaming"));
  vi.stubEnv("XDG_CONFIG_HOME", path.join(home, ".config"));
  vi.stubEnv("SHELL", "/bin/zsh");
  expect(configPath().startsWith(`${home}${path.sep}`)).toBe(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network call."))),
  );
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

describe("rp init, first setup", () => {
  it("saves every choice of a first setup, but never the API key", async () => {
    const session = await runSetup(
      [
        pick("Anthropic"),
        pickModel("claude-sonnet-5"),
        pick("code"),
        pick("complete"),
        YES, // copy the result automatically
        pick("English"), // interface language
        pick("Français"), // language of the generated prompts
        NO, // streaming
        "45000",
        SAVE,
        NO, // connection test
      ],
      { env: ANTHROPIC_ENV },
    );

    expect(await readSavedConfig()).toEqual({
      ...DEFAULT_CHOICES,
      defaultModel: "claude-sonnet-5",
      defaultProfile: "code",
      defaultLevel: "complete",
      copyAfterGeneration: true,
      stream: false,
      timeoutMs: 45000,
      uiLocale: "en",
      outputLanguage: "fr",
    });
    expect(await readFile(configPath(), "utf8")).not.toContain(ANTHROPIC_KEY);
    expect(session.transcript).toContain("Configure ton provider, ton modèle");
    expect(session.transcript).toContain("+ ANTHROPIC_API_KEY détectée.");
    expect(session.transcript).toContain("+ Configuration enregistrée avec succès.");
    expect(session.transcript).toContain(configPath());
    expect(session.transcript).not.toContain("\u001b[");
  });

  it("shows a summary and creates nothing when the setup is cancelled", async () => {
    const session = await runSetup([ENTER, ENTER, ...KEEP_PREFERENCES, CANCEL], {
      env: ANTHROPIC_ENV,
    });

    expect(session.transcript).toMatch(/Provider\s+Anthropic/u);
    expect(session.transcript).toMatch(/Clé API\s+détectée dans ANTHROPIC_API_KEY/u);
    expect(session.transcript).toMatch(/Sortie max\.\s+adaptative/u);
    expect(session.transcript).toContain("! Initialisation annulée.");
    expect(existsSync(configPath())).toBe(false);
    // Nothing keeps reading the terminal once the setup is over.
    expect(session.input.listenerCount("data")).toBe(0);
  });

  it("lets the person change their answers before saving", async () => {
    const session = await runSetup(
      [
        ENTER,
        ENTER,
        ...KEEP_PREFERENCES,
        CHANGE,
        ENTER, // provider
        pick("Saisir un identifiant manuellement"),
        "claude-sonnet-5-preview",
        pick("writing"),
        ENTER, // level
        ENTER, // auto copy
        ENTER, // interface language
        pick("Autre langue"),
        "es",
        ENTER, // streaming
        "60000",
        SAVE,
        NO,
      ],
      { env: ANTHROPIC_ENV },
    );

    expect(occurrences(session.transcript, "Quel provider souhaites-tu utiliser ?")).toBe(2);
    expect(session.transcript).toMatch(/Langue générée\s+es/u);
    expect(await readSavedConfig()).toEqual({
      ...DEFAULT_CHOICES,
      defaultModel: "claude-sonnet-5-preview",
      defaultProfile: "writing",
      outputLanguage: "es",
      timeoutMs: 60000,
    });
  });

  it("runs the first setup without confirmation when --reset finds nothing to replace", async () => {
    const session = await runSetup([ENTER, ENTER, ...KEEP_PREFERENCES, SAVE, NO], {
      env: ANTHROPIC_ENV,
      reset: true,
    });

    expect(session.transcript).not.toContain("Confirmer l'écrasement");
    expect(await readSavedConfig()).toEqual(DEFAULT_CHOICES);
  });

  it("speaks the interface language it is given", async () => {
    const session = await runSetup([ENTER, ENTER, ...KEEP_PREFERENCES, pick("Cancel")], {
      env: ANTHROPIC_ENV,
      t: createTranslator("en"),
    });

    expect(session.transcript).toContain("Guided setup");
    expect(session.transcript).toContain("Which provider would you like to use?");
    expect(session.transcript).toContain("+ ANTHROPIC_API_KEY detected.");
    expect(session.transcript).toContain("! Setup cancelled.");
  });
});

describe("rp init, provider key missing", () => {
  it("prints the commands that export the key in the shell of the process, then saves", async () => {
    vi.stubEnv("SHELL", "/bin/bash");

    const session = await runSetup([
      pick("OpenAI"),
      pick("Afficher les instructions de configuration"),
      ENTER, // recommended model
      ...KEEP_PREFERENCES,
      SAVE,
    ]);

    const modelQuestion = session.transcript.indexOf("Quel modèle souhaites-tu utiliser ?");
    const beforeModel = session.transcript.slice(0, modelQuestion);
    const afterModel = session.transcript.slice(modelQuestion);
    expect(beforeModel).toContain("! OPENAI_API_KEY non détectée.");
    // The commands come at once, before the setup moves on…
    expect(beforeModel).toContain('$ export OPENAI_API_KEY="votre-clé"');
    expect(beforeModel).toContain(`$ echo 'export OPENAI_API_KEY="votre-clé"' >> ~/.bashrc`);
    // …and the closing note adds the secure alternative.
    expect(afterModel).toContain("$ rp auth login openai");
    expect(afterModel).toMatch(/Clé API\s+non configuré/u);
    // Without a key there is nothing to test the connection with.
    expect(session.transcript).not.toContain("Tester maintenant la connexion");
    expect(await readSavedConfig()).toMatchObject({
      defaultProvider: "openai",
      defaultModel: getFallbackModelForProvider("openai"),
    });
  });

  it.each([
    { shell: "/usr/bin/fish", command: 'set -Ux MISTRAL_API_KEY "votre-clé"' },
    { shell: "pwsh", command: '$env:MISTRAL_API_KEY="votre-clé"' },
    { shell: "/bin/zsh", command: `echo 'export MISTRAL_API_KEY="votre-clé"' >> ~/.zshrc` },
  ])("continues without the key, then explains how to add it in $shell", async (example) => {
    const session = await runSetup(
      [
        pick("Mistral"),
        pick("Continuer sans clé pour le moment"),
        ENTER,
        ...KEEP_PREFERENCES,
        SAVE,
      ],
      { shell: example.shell },
    );

    expect(session.transcript).toContain("Clé API à configurer");
    expect(occurrences(session.transcript, example.command)).toBe(1);
    expect(session.transcript).toContain("$ rp auth login mistral");
    expect(await readSavedConfig()).toMatchObject({ defaultProvider: "mistral" });
  });

  it("goes back to the provider list when the person has no key for their choice", async () => {
    const session = await runSetup(
      [
        pick("DeepSeek"),
        pick("Revenir au choix du provider"),
        pick("Anthropic"),
        ENTER,
        ...KEEP_PREFERENCES,
        SAVE,
        NO,
      ],
      { env: ANTHROPIC_ENV },
    );

    expect(session.transcript).toContain("! DEEPSEEK_API_KEY non détectée.");
    expect(occurrences(session.transcript, "Quel provider souhaites-tu utiliser ?")).toBe(2);
    expect(await readSavedConfig()).toMatchObject({ defaultProvider: "anthropic" });
  });
});

describe("rp init, OpenAI-compatible endpoints", () => {
  it("configures a local server that needs no key, with its own model and headers", async () => {
    const session = await runSetup([
      pick("Serveur local compatible OpenAI"),
      ENTER, // internal id
      "Ollama",
      ENTER, // base URL
      ENTER, // no key variable
      '{"X-Team": "core", "X-Retry": 2}',
      "llama3.2",
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect(session.prompts).toContain("Identifiant interne du provider (local) : ");
    expect(session.prompts).toContain("Base URL (http://localhost:11434/v1) : ");
    expect(session.transcript).toContain("+ Aucune variable de clé API nécessaire.");
    expect(session.transcript).not.toContain("Comment souhaites-tu continuer ?");
    expect(session.transcript).toMatch(/Nom provider\s+Ollama/u);
    expect(session.transcript).toMatch(/Variable clé\s+aucune/u);
    const saved = await readSavedConfig();
    expect(saved).toMatchObject({ defaultProvider: "openai-compatible", defaultModel: "llama3.2" });
    expect(saved.providers).toEqual({
      local: {
        type: "openai-compatible",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        customHeaders: { "X-Team": "core", "X-Retry": "2" },
      },
    });
  });

  it("configures a hosted gateway whose key lives in a variable of its own", async () => {
    const gatewayKey = "gateway-test-key";

    const session = await runSetup(
      [
        pick("OpenAI Compatible"),
        "gateway",
        "Gateway",
        "https://gateway.example.test/v1",
        "GATEWAY_API_KEY",
        ENTER, // no custom headers
        "vendor/model-x",
        ...KEEP_PREFERENCES,
        SAVE,
        NO,
      ],
      { env: { GATEWAY_API_KEY: gatewayKey } },
    );

    expect(session.prompts).toContain("Identifiant interne du provider (custom) : ");
    expect(session.transcript).toContain("+ GATEWAY_API_KEY détectée.");
    expect(session.transcript).not.toContain("Clé API à configurer");
    const saved = await readSavedConfig();
    expect(saved.defaultModel).toBe("vendor/model-x");
    expect(saved.providers).toEqual({
      gateway: {
        type: "openai-compatible",
        name: "Gateway",
        baseUrl: "https://gateway.example.test/v1",
        apiKeyEnv: "GATEWAY_API_KEY",
      },
    });
    expect(JSON.stringify(saved)).not.toContain(gatewayKey);
  });

  it("explains how to set an unset key variable, without offering secure storage", async () => {
    const session = await runSetup([
      pick("OpenAI Compatible"),
      ENTER, // internal id
      ENTER, // name
      "https://gateway.example.test/v1",
      "GATEWAY_API_KEY",
      ENTER, // no custom headers
      "vendor/model-x",
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect(session.transcript).toMatch(/Clé API\s+non détectée dans GATEWAY_API_KEY/u);
    expect(session.transcript).toContain('$ export GATEWAY_API_KEY="votre-clé"');
    // `rp auth login` only stores keys of the built-in providers.
    expect(session.transcript).not.toContain("rp auth login");
    expect((await readSavedConfig()).providers).toEqual({
      custom: {
        type: "openai-compatible",
        name: "OpenAI Compatible",
        baseUrl: "https://gateway.example.test/v1",
        apiKeyEnv: "GATEWAY_API_KEY",
      },
    });
  });

  // Bug: a fresh setup proposes the Anthropic default model for a local server,
  // because the "local-model" fallback is never reached (first-run.ts:392).
  it.todo("proposes a local model id rather than the Anthropic default for a new local server");
});

describe("rp init, existing configuration", () => {
  it("modifies an existing configuration and keeps what the questions do not cover", async () => {
    await writeExistingConfig(JSON.stringify(EXISTING_CONFIG));

    const session = await runSetup([...KEEP_EXISTING_ANSWERS, SAVE, NO], { env: ANTHROPIC_ENV });

    expect(session.transcript).toContain("Une configuration Reqraft existe déjà.");
    expect(session.transcript).not.toContain("Configure ton provider");
    expect(session.prompts).toContain("Langue de sortie (de) : ");
    expect(session.prompts).toContain("Timeout en millisecondes (45000) : ");
    expect(session.transcript).toMatch(/Sortie max\.\s+900 tokens/u);
    expect(session.transcript).toMatch(/Stats\s+oui/u);
    expect(await readSavedConfig()).toEqual(EXISTING_CONFIG);
  });

  it("proposes the saved settings of a local server when modifying it", async () => {
    await writeExistingConfig(
      JSON.stringify({
        defaultProvider: "openai-compatible",
        defaultModel: "llama3.2",
        providers: {
          local: {
            type: "openai-compatible",
            name: "Ollama",
            baseUrl: "http://localhost:11434/v1",
          },
        },
      }),
    );

    const session = await runSetup([
      ENTER, // modify
      ENTER, // provider, as saved
      ENTER, // internal id, as saved
      ENTER, // name, as saved
      "http://localhost:8080/v1",
      ENTER, // no key variable
      ENTER, // no custom headers
      ENTER, // model, as saved
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect(session.prompts).toContain("Nom personnalisé du provider (Ollama) : ");
    expect(session.prompts).toContain("Base URL (http://localhost:11434/v1) : ");
    expect(session.prompts).toContain("Identifiant du modèle (llama3.2) : ");
    const saved = await readSavedConfig();
    expect(saved.defaultModel).toBe("llama3.2");
    expect(saved.providers).toEqual({
      local: { type: "openai-compatible", name: "Ollama", baseUrl: "http://localhost:8080/v1" },
    });
  });

  it("starts again from the defaults once the overwrite is confirmed", async () => {
    await writeExistingConfig(JSON.stringify(EXISTING_CONFIG));

    const session = await runSetup(
      [
        pick("Recommencer avec les valeurs par défaut"),
        YES,
        ENTER,
        ENTER,
        ...KEEP_PREFERENCES,
        SAVE,
        NO,
      ],
      { env: ANTHROPIC_ENV },
    );

    expect(session.prompts).toContain(
      "Confirmer l'écrasement de la configuration existante ? (o/N) : ",
    );
    expect(await readSavedConfig()).toEqual(DEFAULT_CHOICES);
  });

  it("replaces the configuration with the defaults once rp init --reset is confirmed", async () => {
    await writeExistingConfig(JSON.stringify(EXISTING_CONFIG));

    const session = await runSetup([YES, ENTER, ENTER, ...KEEP_PREFERENCES, SAVE, NO], {
      env: ANTHROPIC_ENV,
      reset: true,
    });

    expect(session.prompts[0]).toBe(
      "Une configuration Reqraft existe déjà. Confirmer l'écrasement avec les valeurs par défaut ? (o/N) : ",
    );
    expect(session.transcript).not.toContain("Modifier la configuration existante");
    expect(await readSavedConfig()).toEqual(DEFAULT_CHOICES);
  });

  it.each([
    { way: "by cancelling", reset: false, answers: [pick("Annuler")] },
    {
      way: "by declining the overwrite",
      reset: false,
      answers: [pick("Recommencer avec les valeurs par défaut"), ENTER],
    },
    { way: "by declining rp init --reset", reset: true, answers: [NO] },
  ])("leaves the existing configuration untouched $way", async ({ reset, answers }) => {
    const original = JSON.stringify(EXISTING_CONFIG);
    await writeExistingConfig(original);

    const session = await runSetup(answers, { reset });

    expect(session.transcript).toContain("! Initialisation annulée.");
    expect(await readFile(configPath(), "utf8")).toBe(original);
  });

  it("shows the existing configuration and changes nothing", async () => {
    const original = JSON.stringify(EXISTING_CONFIG);
    await writeExistingConfig(original);

    const session = await runSetup([pick("Afficher la configuration")]);

    expect(session.transcript).toContain('"defaultModel": "claude-sonnet-5"');
    expect(session.transcript).toContain('"maxOutputTokens": 900');
    expect(session.prompts).toHaveLength(1);
    expect(await readFile(configPath(), "utf8")).toBe(original);
  });

  it("prints the existing configuration once when asked to show it", async () => {
    await writeExistingConfig(JSON.stringify(EXISTING_CONFIG));

    const session = await runSetup([pick("Afficher la configuration")]);

    expect(occurrences(session.transcript, '"defaultModel": "claude-sonnet-5"')).toBe(1);
  });

  it("summarises and tests the compatible provider just added, not the first one saved", async () => {
    await writeExistingConfig(
      JSON.stringify({
        defaultProvider: "openai-compatible",
        defaultModel: "llama3.2",
        providers: {
          local: {
            type: "openai-compatible",
            name: "Ollama",
            baseUrl: "http://localhost:11434/v1",
          },
        },
      }),
    );
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(chatCompletion("OK")));
    vi.stubGlobal("fetch", fetchMock);

    const session = await runSetup([
      ENTER, // modify
      pick("OpenAI Compatible"),
      "gateway",
      "Gateway",
      "https://gateway.example.test/v1",
      ENTER, // no key variable
      ENTER, // no custom headers
      "vendor/model-x",
      ...KEEP_PREFERENCES,
      SAVE,
      YES, // connection test
    ]);

    expect(session.transcript).toMatch(/Base URL\s+https:\/\/gateway\.example\.test\/v1\n/u);
    expect(session.transcript).toMatch(/Nom provider\s+Gateway\n/u);
    // A run builds its provider from the saved file: it calls the same endpoint.
    const saved = await loadUserConfig();
    await createProvider(saved.defaultProvider, {}, saved).generate({
      systemPrompt: "Rewrite the request.",
      userPrompt: "fix login bug",
      model: saved.defaultModel,
      temperature: 0.2,
      maxOutputTokens: 100,
      stream: false,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://gateway.example.test/v1/chat/completions",
      "https://gateway.example.test/v1/chat/completions",
    ]);
    // The endpoint saved earlier stays declared.
    expect(saved.providers?.local).toMatchObject({ baseUrl: "http://localhost:11434/v1" });
  });
});

describe("rp init, Enter while modifying", () => {
  it.each([
    { kind: "a model of the list", model: "claude-sonnet-5", typed: [] },
    // Typed by hand: the manual entry is proposed, then the identifier itself.
    { kind: "a model typed by hand", model: "claude-sonnet-5-preview", typed: [ENTER] },
  ])("keeps $kind when Enter is pressed while modifying", async ({ model, typed }) => {
    await writeExistingConfig(JSON.stringify({ ...EXISTING_CONFIG, defaultModel: model }));

    const session = await runSetup([...KEEP_EXISTING_ANSWERS, ...typed, SAVE, NO], {
      env: ANTHROPIC_ENV,
    });

    expect(await readSavedConfig()).toEqual({ ...EXISTING_CONFIG, defaultModel: model });
    expect(session.transcript).toMatch(new RegExp(String.raw`Modèle\s+${model}\n`, "u"));
  });

  it("proposes the recommended model of a provider the configuration did not use", async () => {
    await writeExistingConfig(JSON.stringify(EXISTING_CONFIG));

    await runSetup(
      [
        pick("Modifier la configuration existante"),
        pick("OpenAI"),
        ...Array<Answer>(9).fill(ENTER), // model, then the saved preferences
        SAVE,
        NO,
      ],
      { env: { OPENAI_API_KEY: "openai-test-key" } },
    );

    expect(await readSavedConfig()).toMatchObject({
      defaultProvider: "openai",
      defaultModel: getFallbackModelForProvider("openai"),
    });
  });

  it("keeps a minimal level when Enter is pressed while modifying", async () => {
    await writeExistingConfig(JSON.stringify({ ...EXISTING_CONFIG, defaultLevel: "minimal" }));

    await runSetup([...KEEP_EXISTING_ANSWERS, SAVE, NO], { env: ANTHROPIC_ENV });

    expect(await readSavedConfig()).toEqual({ ...EXISTING_CONFIG, defaultLevel: "minimal" });
  });

  it("keeps the custom headers of a saved provider when Enter is pressed while modifying", async () => {
    const gateway = {
      type: "openai-compatible",
      name: "Gateway",
      baseUrl: "https://gateway.example.test/v1",
      customHeaders: { "X-Team": "core", Authorization: "Bearer gateway-test-token" },
    };
    await writeExistingConfig(
      JSON.stringify({
        defaultProvider: "openai-compatible",
        defaultModel: "vendor/model-x",
        providers: { gateway },
      }),
    );

    const session = await runSetup([
      ENTER, // modify
      ENTER, // provider, as saved
      ENTER, // internal id, as saved
      ENTER, // name, as saved
      ENTER, // base URL, as saved
      ENTER, // no key variable
      ENTER, // custom headers, as saved
      ENTER, // model, as saved
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect((await readSavedConfig()).providers).toEqual({ gateway });
    // A header may carry a token: the question names the saved headers only.
    expect(session.prompts).toContain(
      "Headers personnalisés JSON (optionnel) (X-Team, Authorization) : ",
    );
    expect(session.transcript).not.toContain("gateway-test-token");
  });

  it("removes the saved custom headers when an empty object is typed", async () => {
    await writeExistingConfig(
      JSON.stringify({
        defaultProvider: "openai-compatible",
        defaultModel: "llama3.2",
        providers: {
          local: {
            type: "openai-compatible",
            baseUrl: "http://localhost:11434/v1",
            customHeaders: { "X-Team": "core" },
          },
        },
      }),
    );

    await runSetup([
      ...Array<Answer>(6).fill(ENTER), // modify, provider, id, name, base URL, key variable
      "{}",
      ENTER, // model, as saved
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect((await readSavedConfig()).providers).toEqual({
      local: {
        type: "openai-compatible",
        name: "OpenAI Compatible",
        baseUrl: "http://localhost:11434/v1",
      },
    });
  });
});

describe("rp init, invalid answers", () => {
  it("asks again after a menu choice that is not on the list", async () => {
    const session = await runSetup(["0", "9", "abc", ENTER, ENTER, ...KEEP_PREFERENCES, SAVE, NO], {
      env: ANTHROPIC_ENV,
    });

    expect(occurrences(session.transcript, "x Choix invalide.")).toBe(3);
    expect(await readSavedConfig()).toMatchObject({ defaultProvider: "anthropic" });
  });

  it("asks again until the answer is yes or no, in French or in English", async () => {
    const session = await runSetup(
      [
        ENTER, // provider
        ENTER, // model
        ENTER, // profile
        ENTER, // level
        "peut-être",
        "yes", // auto copy
        ENTER, // interface language
        ENTER, // output language
        "no", // streaming
        ENTER, // timeout
        SAVE,
        "non", // connection test
      ],
      { env: ANTHROPIC_ENV },
    );

    expect(occurrences(session.transcript, "x Réponds par oui ou non.")).toBe(1);
    expect(await readSavedConfig()).toMatchObject({ copyAfterGeneration: true, stream: false });
  });

  it("asks again for a timeout that is not a strictly positive integer", async () => {
    const session = await runSetup(
      [
        ...Array<Answer>(8).fill(ENTER), // everything before the timeout
        "0",
        "-5",
        "1.5",
        "trente",
        "20000",
        SAVE,
        NO,
      ],
      { env: ANTHROPIC_ENV },
    );

    expect(
      occurrences(session.transcript, "x Le timeout doit être un entier strictement positif."),
    ).toBe(4);
    expect(await readSavedConfig()).toMatchObject({ timeoutMs: 20000 });
  });

  it("asks again for custom headers that are not a JSON object", async () => {
    const session = await runSetup([
      pick("Serveur local compatible OpenAI"),
      ENTER, // internal id
      "Ollama",
      ENTER, // base URL
      ENTER, // no key variable
      '["X-Team", "core"]',
      "null",
      '{"X-Team": core}',
      '{"X-Team": "core"}',
      "llama3.2",
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect(
      occurrences(session.transcript, "x Les headers personnalisés doivent être un objet JSON."),
    ).toBe(3);
    expect((await readSavedConfig()).providers).toEqual({
      local: {
        type: "openai-compatible",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        customHeaders: { "X-Team": "core" },
      },
    });
  });
});

describe("rp init, connection test", () => {
  it("tests the connection to a local server and reports how long it took", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = vi.fn<typeof fetch>(() => {
      vi.advanceTimersByTime(120);
      return Promise.resolve(chatCompletion("OK"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const session = await runSetup([...LOCAL_OLLAMA, ...KEEP_PREFERENCES, SAVE, YES]);

    expect(session.transcript).toContain("+ Connexion réussie en 120 ms.");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init?.method).toBe("POST");
    // No key was configured, so none is sent.
    expect(init?.headers).not.toHaveProperty("Authorization");
    const body = requestBody(init);
    expect(body).toMatchObject({
      model: "llama3.2",
      max_tokens: REPROMPT_POLICY.runtime.connectionCheckMaxOutputTokens,
    });
    expect(body).not.toHaveProperty("stream");
  });

  it("reports a local server it cannot reach, with the configuration already saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError("fetch failed"))),
    );

    const session = await runSetup([...LOCAL_OLLAMA, ...KEEP_PREFERENCES, SAVE, YES]);

    expect(session.transcript).toContain(
      "x Test de connexion échoué : Ollama est inaccessible. Vérifie la connexion réseau et la base URL du provider, puis réessaie.",
    );
    expect(await readSavedConfig()).toMatchObject({
      defaultProvider: "openai-compatible",
      defaultModel: "llama3.2",
    });
  });

  it("sends the key from the environment, and reports when the provider rejects it", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response("invalid x-api-key", { status: 401 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await runSetup([ENTER, ENTER, ...KEEP_PREFERENCES, SAVE, YES], {
      env: ANTHROPIC_ENV,
    });

    expect(session.transcript).toContain(
      "x Test de connexion échoué : La clé API anthropic a été refusée.",
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init?.headers).toMatchObject({ "x-api-key": ANTHROPIC_KEY });
    expect(await readFile(configPath(), "utf8")).not.toContain(ANTHROPIC_KEY);
  });
});

describe("rp init, unusable environment", () => {
  it("refuses to start while an environment key holds a placeholder", async () => {
    const { session, finished } = startSetup([], { env: { OPENAI_API_KEY: "votre-clé" } });

    await expect(finished).rejects.toMatchObject({
      errorCode: "credential.placeholder",
      params: { envName: "OPENAI_API_KEY" },
    });
    expect(session.prompts).toEqual([]);
    expect(existsSync(configPath())).toBe(false);
  });

  it("releases the input when an environment key holds a placeholder", async () => {
    const { session, finished } = startSetup([], { env: { OPENAI_API_KEY: "votre-clé" } });

    await expect(finished).rejects.toMatchObject({ errorCode: "credential.placeholder" });
    // Nothing keeps reading the terminal once the setup has given up.
    expect(session.input.listenerCount("data")).toBe(0);
  });

  it("stops without asking anything when the existing configuration is unreadable", async () => {
    await writeExistingConfig("{ not json");
    const { session, finished } = startSetup([]);

    await expect(finished).rejects.toMatchObject({ errorCode: "config.invalid" });
    expect(session.prompts).toEqual([]);
    expect(session.input.listenerCount("data")).toBe(0);
    expect(await readFile(configPath(), "utf8")).toBe("{ not json");
  });

  it("lets rp init --reset replace an unreadable configuration", async () => {
    await writeExistingConfig("{ not json");

    const session = await runSetup([YES, ENTER, ENTER, ...KEEP_PREFERENCES, SAVE, NO], {
      env: ANTHROPIC_ENV,
      reset: true,
    });

    expect(session.prompts[0]).toBe(
      "Une configuration Reqraft existe déjà. Confirmer l'écrasement avec les valeurs par défaut ? (o/N) : ",
    );
    expect(await readSavedConfig()).toEqual(DEFAULT_CHOICES);
  });
});
