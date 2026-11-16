import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { runFirstRunSetup } from "@/apps/cli/commands/first-run.js";
import { configPath } from "@/config/loader.js";
import type { Translator } from "@/i18n/translate.js";

/**
 * Drives `rp init` the way a person at the keyboard would, for
 * `first-run-flow.test.ts` and `first-run-local-servers.test.ts`.
 *
 * Each test file still declares its own `vi.mock("node:child_process")`:
 * Vitest hoists a mock to the top of the file that declares it.
 */

/** What the person types: a fixed answer, or one read off the question on screen. */
export type Answer = string | ((screen: string) => string);

export interface SetupSession {
  /** Everything written to the terminal, questions included. */
  transcript: string;
  /** Each question, as displayed. */
  prompts: string[];
  input: PassThrough;
}

export interface RunningSetup {
  session: SetupSession;
  /** Settles with the setup; rejects on a question the script did not plan for. */
  finished: Promise<void>;
}

export interface SetupOptions {
  env?: NodeJS.ProcessEnv;
  reset?: boolean;
  shell?: string;
  t?: Translator;
  /** The machine's memory; 8 GB unless a test says otherwise. */
  totalMemoryBytes?: number;
}

export const GIB = 1024 ** 3;

export const ENTER = "";
export const YES = "o";
export const NO = "n";

export function menuNumber(
  screen: string,
  matches: (label: string) => boolean,
  wanted: string,
): string {
  for (const line of screen.split("\n")) {
    // A menu entry reads "  2. Label", or "> 1. Label" for the proposed one.
    const entry = /^\D*(\d+)\. /.exec(line);
    if (entry?.[1] && matches(line.slice(entry[0].length))) return entry[1];
  }
  throw new Error(`No menu entry for "${wanted}" in:\n${screen}`);
}

/** Chooses the menu entry labelled `label`, as a person reading the screen would. */
export function pick(label: string): Answer {
  return (screen) => menuNumber(screen, (entry) => entry === label, label);
}

/** Chooses a model of the list by its identifier. */
export function pickModel(id: string): Answer {
  return (screen) => menuNumber(screen, (entry) => entry.includes(`(${id})`), id);
}

export const SAVE = pick("Enregistrer la configuration");
export const CHANGE = pick("Modifier un choix");
export const CANCEL = pick("Annuler");
/** Profile, level, auto copy, interface language, output language, streaming, timeout. */
export const KEEP_PREFERENCES: readonly Answer[] = Array<Answer>(7).fill(ENTER);
/** A local Ollama server: default id and URL, no key variable, no headers. */
export const LOCAL_OLLAMA: readonly Answer[] = [
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
export function startSetup(answers: readonly Answer[], options: SetupOptions = {}): RunningSetup {
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
      totalMemoryBytes: options.totalMemoryBytes ?? 8 * GIB,
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

export async function runSetup(
  answers: readonly Answer[],
  options: SetupOptions = {},
): Promise<SetupSession> {
  const { session, finished } = startSetup(answers, options);
  await finished;
  return session;
}

export function occurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

export async function readSavedConfig(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(configPath(), "utf8")) as Record<string, unknown>;
}

export async function writeExistingConfig(content: string): Promise<void> {
  await mkdir(path.dirname(configPath()), { recursive: true });
  await writeFile(configPath(), content, "utf8");
}

export function chatCompletion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function requestBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
}

/** The address a mocked `fetch` was called with, whatever form it took. */
export function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/**
 * A home of its own for each test, so `rp init` writes nowhere real, and a
 * network that refuses every call the test did not plan for.
 */
export function useInitSandbox(): void {
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
}
