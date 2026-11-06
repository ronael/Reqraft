import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  credentialStatus,
  hydrateCredentials,
  login,
  logout,
  supportsSecureCredentialStorage,
} from "@/auth/credentials.js";
import { createTranslator } from "@/i18n/translate.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

interface CommandOutput {
  stdout: string;
  stderr: string;
}

// The module reaches the keychain through `security` and `secret-tool` and
// offers no injection point for them, so the process boundary is faked: no
// test ever runs a real command against a real keychain.
const system = vi.hoisted(() => ({
  execFile: vi.fn<(file: string, args: readonly string[]) => Promise<CommandOutput>>(),
  spawn: vi.fn<(command: string, args: readonly string[]) => EventEmitter>(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const { promisify } = await import("node:util");
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    // Like the real execFile, the fake exposes its promise form through
    // promisify.custom, which is what the module ends up calling.
    execFile: Object.assign(vi.fn(), { [promisify.custom]: system.execFile }),
    spawn: system.spawn,
  };
});

const en = createTranslator("en");

type SecretToolOutcome = { readonly exitCode: number } | { readonly startError: Error };

/** A `secret-tool store` process: it takes the key on stdin, then exits or fails to start. */
class SecretToolStoreProcess extends EventEmitter {
  receivedOnStdin = "";
  readonly stdin = {
    end: (input: string): void => {
      this.receivedOnStdin += input;
      setImmediate(() => {
        this.settle();
      });
    },
  };

  constructor(private readonly outcome: SecretToolOutcome) {
    super();
  }

  private settle(): void {
    if ("startError" in this.outcome) {
      this.emit("error", this.outcome.startError);
    } else {
      this.emit("close", this.outcome.exitCode);
    }
  }
}

function runOn(platform: NodeJS.Platform): void {
  vi.spyOn(process, "platform", "get").mockReturnValue(platform);
}

/** A command that failed the way execFile reports it: an exit code, or ENOENT for a missing tool. */
function commandFailure(code: number | string): Error {
  return Object.assign(new Error(`Command failed: ${String(code)}`), { code });
}

/**
 * Answers each command line listed with its stdout. Any other command fails,
 * as `security` and `secret-tool` do when no matching key is stored.
 */
function commandsAnswering(outputs: Readonly<Record<string, string>>): void {
  system.execFile.mockImplementation((file, args) => {
    const stdout = outputs[[file, ...args].join(" ")];
    return stdout === undefined
      ? Promise.reject(commandFailure(44))
      : Promise.resolve({ stdout, stderr: "" });
  });
}

function issuedCommands(): Set<string> {
  return new Set(system.execFile.mock.calls.map(([file, args]) => [file, ...args].join(" ")));
}

function recordingOutput(): {
  lines: string[];
  log: (message: string) => void;
  write: (message: string) => void;
} {
  const lines: string[] = [];
  const record = (message: string): void => {
    lines.push(message);
  };
  return { lines, log: record, write: record };
}

function typed(secret: string): () => Promise<string> {
  return () => Promise.resolve(secret);
}

const acceptKey = (): Promise<void> => Promise.resolve();

function storageUnavailable(provider: string): object {
  return {
    errorCode: "credential.storage_unavailable",
    exitCode: EXIT_CODES.INVALID_CONFIGURATION,
    params: { provider },
  };
}

beforeEach(() => {
  system.execFile.mockReset();
  system.spawn.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("secure storage support", () => {
  it.each([
    ["darwin", true],
    ["linux", true],
    ["win32", false],
  ] as const)("answers for the running platform (%s) by default", (platform, supported) => {
    runOn(platform);

    expect(supportsSecureCredentialStorage()).toBe(supported);
  });
});

describe("loading stored keys at startup", () => {
  it("fills unset key variables from the macOS keychain, skipping missing or blank entries", async () => {
    runOn("darwin");
    commandsAnswering({
      "security find-generic-password -s reqraft:anthropic -w": "sk-ant-stored\n",
      "security find-generic-password -s reqraft:mistral -w": "\n",
    });
    const env: NodeJS.ProcessEnv = {};

    await hydrateCredentials(env);

    expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-ant-stored" });
    expect(issuedCommands()).toEqual(
      new Set([
        "security find-generic-password -s reqraft:anthropic -w",
        "security find-generic-password -s reqraft:openai -w",
        "security find-generic-password -s reqraft:deepseek -w",
        "security find-generic-password -s reqraft:mistral -w",
      ]),
    );
  });

  it("keeps a key variable from the environment over the stored key", async () => {
    runOn("darwin");
    commandsAnswering({
      "security find-generic-password -s reqraft:openai -w": "sk-proj-stored\n",
    });
    const env: NodeJS.ProcessEnv = { OPENAI_API_KEY: "sk-proj-from-env" };

    await hydrateCredentials(env);

    expect(env.OPENAI_API_KEY).toBe("sk-proj-from-env");
    expect(issuedCommands()).toEqual(
      new Set([
        "security find-generic-password -s reqraft:anthropic -w",
        "security find-generic-password -s reqraft:deepseek -w",
        "security find-generic-password -s reqraft:mistral -w",
      ]),
    );
  });

  it("treats an empty key variable as unset", async () => {
    runOn("darwin");
    commandsAnswering({
      "security find-generic-password -s reqraft:openai -w": "sk-proj-stored\n",
    });
    const env: NodeJS.ProcessEnv = { OPENAI_API_KEY: "" };

    await hydrateCredentials(env);

    expect(env.OPENAI_API_KEY).toBe("sk-proj-stored");
  });

  it("reads the keys through secret-tool on Linux", async () => {
    runOn("linux");
    commandsAnswering({ "secret-tool lookup service reqraft provider deepseek": "sk-ds-stored" });
    const env: NodeJS.ProcessEnv = {};

    await hydrateCredentials(env);

    expect(env).toEqual({ DEEPSEEK_API_KEY: "sk-ds-stored" });
    expect(issuedCommands()).toEqual(
      new Set([
        "secret-tool lookup service reqraft provider anthropic",
        "secret-tool lookup service reqraft provider openai",
        "secret-tool lookup service reqraft provider deepseek",
        "secret-tool lookup service reqraft provider mistral",
      ]),
    );
  });

  it("starts without stored keys when secret-tool is not installed", async () => {
    runOn("linux");
    system.execFile.mockRejectedValue(commandFailure("ENOENT"));
    const env: NodeJS.ProcessEnv = {};

    await expect(hydrateCredentials(env)).resolves.toBeUndefined();

    expect(env).toEqual({});
  });

  it("does not look for stored keys on Windows", async () => {
    runOn("win32");
    const env: NodeJS.ProcessEnv = {};

    await hydrateCredentials(env);

    expect(env).toEqual({});
    expect(system.execFile).not.toHaveBeenCalled();
  });

  it("rejects a placeholder key variable before reading the keychain", async () => {
    runOn("darwin");

    await expect(hydrateCredentials({ MISTRAL_API_KEY: "  Your-API-Key " })).rejects.toMatchObject({
      errorCode: "credential.placeholder",
      exitCode: EXIT_CODES.INVALID_CONFIGURATION,
      params: { envName: "MISTRAL_API_KEY" },
    });
    expect(system.execFile).not.toHaveBeenCalled();
  });
});

describe("reporting where each key comes from", () => {
  it("prefers the environment, flags placeholders, then falls back to the keychain", async () => {
    runOn("darwin");
    commandsAnswering({
      "security find-generic-password -s reqraft:anthropic -w": "sk-ant-stored\n",
      "security find-generic-password -s reqraft:deepseek -w": "sk-ds-stored\n",
    });
    const output = recordingOutput();

    await credentialStatus(
      { env: { OPENAI_API_KEY: "votre-clé", DEEPSEEK_API_KEY: "sk-ds-from-env" }, output },
      en,
    );

    expect(output.lines).toEqual(
      expect.arrayContaining([
        "anthropic  secure storage",
        "openai     invalid environment variable (placeholder value)",
        "deepseek   environment variable",
        "mistral    not configured",
      ]),
    );
    expect(issuedCommands()).toEqual(
      new Set([
        "security find-generic-password -s reqraft:anthropic -w",
        "security find-generic-password -s reqraft:mistral -w",
      ]),
    );
  });
});

describe("saving a key at login", () => {
  it("saves a validated key in the macOS keychain", async () => {
    runOn("darwin");
    system.execFile.mockResolvedValue({ stdout: "", stderr: "" });
    const output = recordingOutput();

    await login(
      "anthropic",
      { env: {}, output, readSecret: typed("sk-ant-typed"), validateCredential: acceptKey },
      en,
    );

    expect(system.execFile).toHaveBeenCalledExactlyOnceWith("security", [
      "add-generic-password",
      "-U",
      "-s",
      "reqraft:anthropic",
      "-a",
      "reqraft",
      "-w",
      "sk-ant-typed",
    ]);
    expect(output.lines).toContain("anthropic key saved in secure system storage.");
  });

  it("hands the key to secret-tool on stdin, never on its command line", async () => {
    runOn("linux");
    const secretTool = new SecretToolStoreProcess({ exitCode: 0 });
    system.spawn.mockReturnValue(secretTool);
    const output = recordingOutput();

    await login(
      "openai",
      { env: {}, output, readSecret: typed("sk-proj-typed"), validateCredential: acceptKey },
      en,
    );

    expect(system.spawn).toHaveBeenCalledExactlyOnceWith("secret-tool", [
      "store",
      "--label=Reqraft API key",
      "service",
      "reqraft",
      "provider",
      "openai",
    ]);
    expect(secretTool.receivedOnStdin).toBe("sk-proj-typed");
    expect(output.lines).toContain("openai key saved in secure system storage.");
  });

  it("warns that a key variable from the environment keeps priority", async () => {
    runOn("darwin");
    system.execFile.mockResolvedValue({ stdout: "", stderr: "" });
    const output = recordingOutput();

    await login(
      "mistral",
      {
        env: { MISTRAL_API_KEY: "old-env-key" },
        output,
        readSecret: typed("ms-new-key"),
        validateCredential: acceptKey,
      },
      en,
    );

    expect(output.lines.slice(-3)).toEqual([
      "mistral key saved in secure system storage.",
      "Warning: MISTRAL_API_KEY is already set and takes priority over secure storage.",
      "Remove that variable if it contains an old key, then restart your terminal.",
    ]);
  });

  it("reports unavailable storage when secret-tool refuses the key", async () => {
    runOn("linux");
    system.spawn.mockReturnValue(new SecretToolStoreProcess({ exitCode: 1 }));
    const output = recordingOutput();

    await expect(
      login(
        "openai",
        { env: {}, output, readSecret: typed("sk-proj-typed"), validateCredential: acceptKey },
        en,
      ),
    ).rejects.toMatchObject(storageUnavailable("openai"));
    expect(output.lines).not.toContain("openai key saved in secure system storage.");
  });

  it("reports unavailable storage when secret-tool is not installed", async () => {
    runOn("linux");
    const missingTool = commandFailure("ENOENT");
    system.spawn.mockReturnValue(new SecretToolStoreProcess({ startError: missingTool }));

    await expect(
      login(
        "deepseek",
        {
          env: {},
          output: recordingOutput(),
          readSecret: typed("sk-ds-typed"),
          validateCredential: acceptKey,
        },
        en,
      ),
    ).rejects.toMatchObject({ ...storageUnavailable("deepseek"), cause: missingTool });
  });

  it("reports unavailable storage when the keychain refuses the key", async () => {
    runOn("darwin");
    const refusal = commandFailure(1);
    system.execFile.mockRejectedValue(refusal);

    await expect(
      login(
        "anthropic",
        {
          env: {},
          output: recordingOutput(),
          readSecret: typed("sk-ant-typed"),
          validateCredential: acceptKey,
        },
        en,
      ),
    ).rejects.toMatchObject({ ...storageUnavailable("anthropic"), cause: refusal });
  });

  it("refuses to store a key on Windows", async () => {
    runOn("win32");

    await expect(
      login(
        "openai",
        {
          env: {},
          output: recordingOutput(),
          readSecret: typed("sk-proj-typed"),
          validateCredential: acceptKey,
        },
        en,
      ),
    ).rejects.toMatchObject(storageUnavailable("openai"));
    expect(system.execFile).not.toHaveBeenCalled();
    expect(system.spawn).not.toHaveBeenCalled();
  });

  it.each([
    { input: "no key", secret: "", refusal: { message: "No key provided." } },
    {
      input: "a placeholder in any case",
      secret: " API-KEY ",
      refusal: {
        errorCode: "credential.placeholder",
        exitCode: EXIT_CODES.INVALID_CONFIGURATION,
      },
    },
  ])("checks and saves nothing when $input is typed", async ({ secret, refusal }) => {
    const validateCredential = vi.fn(acceptKey);
    const setCredential = vi.fn(acceptKey);

    await expect(
      login(
        "openai",
        {
          env: {},
          output: recordingOutput(),
          readSecret: typed(secret),
          validateCredential,
          setCredential,
        },
        en,
      ),
    ).rejects.toMatchObject(refusal);
    expect(validateCredential).not.toHaveBeenCalled();
    expect(setCredential).not.toHaveBeenCalled();
  });
});

describe("checking a key with its provider before saving it", () => {
  it("lists the provider's models with the typed key, then saves it", async () => {
    runOn("darwin");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ object: "list", data: [{ id: "gpt-5-mini" }] }));
    vi.stubGlobal("fetch", fetchMock);
    system.execFile.mockResolvedValue({ stdout: "", stderr: "" });

    await login(
      "openai",
      { env: {}, output: recordingOutput(), readSecret: typed("sk-proj-typed") },
      en,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/models");
    expect(init?.headers).toEqual({ Authorization: "Bearer sk-proj-typed" });
    // The check is bounded, so a dead network cannot hang the login.
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(system.execFile).toHaveBeenCalledOnce();
  });

  it("never saves a key the provider rejects", async () => {
    runOn("darwin");
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{"error":"invalid_api_key"}', { status: 401 })),
    );
    const output = recordingOutput();

    await expect(
      login("openai", { env: {}, output, readSecret: typed("sk-proj-revoked") }, en),
    ).rejects.toMatchObject({ errorCode: "provider.authentication_failed", httpStatus: 401 });
    expect(system.execFile).not.toHaveBeenCalled();
    expect(output.lines).not.toContain("valid.");
  });
});

describe("typing a key at the interactive prompt", () => {
  it("shows the prompt but never echoes the typed key", async () => {
    const keyboard = new PassThrough();
    vi.spyOn(process, "stdin", "get").mockReturnValue(keyboard as unknown as typeof process.stdin);
    const terminal: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      terminal.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    });
    vi.spyOn(console, "log").mockImplementation((message: string) => {
      terminal.push(message);
    });
    const validateCredential = vi.fn(acceptKey);

    const loggingIn = login(
      "openai",
      { env: {}, validateCredential, setCredential: acceptKey },
      en,
    );
    expect(terminal).toContain("openai API key (hidden input): ");
    keyboard.write("  sk-proj-typed-secret  \r");
    await loggingIn;

    expect(validateCredential).toHaveBeenCalledWith("openai", "sk-proj-typed-secret");
    expect(terminal.join("")).not.toContain("sk-proj-typed-secret");
    expect(terminal).toContain("Checking the key… ");
    expect(terminal).toContain("openai key saved in secure system storage.");
  });
});

describe("removing a key at logout", () => {
  it.each([
    {
      platform: "darwin",
      file: "security",
      args: ["delete-generic-password", "-s", "reqraft:openai"],
    },
    {
      platform: "linux",
      file: "secret-tool",
      args: ["clear", "service", "reqraft", "provider", "openai"],
    },
  ] as const)("deletes the stored key on $platform", async ({ platform, file, args }) => {
    runOn(platform);
    system.execFile.mockResolvedValue({ stdout: "", stderr: "" });
    const output = recordingOutput();

    await logout("openai", { output }, en);

    expect(system.execFile).toHaveBeenCalledExactlyOnceWith(file, args);
    expect(output.lines).toEqual(["openai key removed from secure storage."]);
  });

  it("reports unavailable storage when secret-tool is not installed", async () => {
    runOn("linux");
    const missingTool = commandFailure("ENOENT");
    system.execFile.mockRejectedValue(missingTool);
    const output = recordingOutput();

    await expect(logout("openai", { output }, en)).rejects.toMatchObject({
      ...storageUnavailable("openai"),
      cause: missingTool,
    });
    expect(output.lines).toEqual([]);
  });

  it("refuses to remove a key on Windows", async () => {
    runOn("win32");

    await expect(logout("anthropic", { output: recordingOutput() }, en)).rejects.toMatchObject(
      storageUnavailable("anthropic"),
    );
    expect(system.execFile).not.toHaveBeenCalled();
  });
});
