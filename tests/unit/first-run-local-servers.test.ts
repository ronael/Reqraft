import { describe, expect, it, vi } from "vitest";
import {
  ENTER,
  GIB,
  KEEP_PREFERENCES,
  NO,
  SAVE,
  YES,
  chatCompletion,
  pick,
  readSavedConfig,
  runSetup,
  urlOf,
  useInitSandbox,
  type Answer,
} from "./first-run-harness.js";

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

useInitSandbox();

/**
 * A machine where Ollama and LM Studio run — or not — with the chat models
 * given; `null` means the server is not running. Chat completions answer OK.
 */
function localMachine(servers: {
  ollama?: string[] | null;
  lmstudio?: string[] | null;
  completion?: () => Promise<Response>;
}): ReturnType<typeof vi.fn<typeof fetch>> {
  const list = (ids: string[] | null | undefined): Promise<Response> =>
    ids
      ? Promise.resolve(
          new Response(JSON.stringify({ object: "list", data: ids.map((id) => ({ id })) }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      : Promise.reject(new TypeError("fetch failed"));
  const fetchMock = vi.fn<typeof fetch>((url) => {
    const target = urlOf(url);
    if (target === "http://localhost:11434/v1/models") return list(servers.ollama);
    if (target === "http://localhost:1234/v1/models") return list(servers.lmstudio);
    if (target.endsWith("/chat/completions")) {
      return servers.completion?.() ?? Promise.resolve(chatCompletion("OK"));
    }
    return Promise.reject(new Error(`Unexpected network call to ${target}.`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const LOCAL_CHOICE = pick("Serveur local compatible OpenAI");
/** Internal id, name, base URL, key variable and headers, as proposed. */
const KEEP_ENDPOINT: readonly Answer[] = Array<Answer>(5).fill(ENTER);

describe("rp init, local servers", () => {
  it("offers the models Ollama has installed, leaving embedding models out", async () => {
    localMachine({ ollama: ["llama3.2:latest", "qwen3.5:4b", "nomic-embed-text:latest"] });

    const session = await runSetup([
      LOCAL_CHOICE,
      ...KEEP_ENDPOINT,
      ENTER, // model, as proposed
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect(session.transcript).toContain(
      "+ Ollama détecté sur http://localhost:11434/v1 : 2 modèles installés.",
    );
    expect(session.prompts).toContain("Nom personnalisé du provider (Ollama) : ");
    expect(session.prompts).toContain("Base URL (http://localhost:11434/v1) : ");
    expect(session.transcript).toContain("Quel modèle installé souhaites-tu utiliser ?");
    expect(session.transcript).not.toContain("nomic-embed-text");
    // The recommended model is proposed when it is installed.
    expect(session.transcript).toMatch(/> 2\. qwen3\.5:4b/u);
    expect(await readSavedConfig()).toMatchObject({
      defaultProvider: "openai-compatible",
      defaultModel: "qwen3.5:4b",
      providers: {
        local: { type: "openai-compatible", name: "Ollama", baseUrl: "http://localhost:11434/v1" },
      },
    });
  });

  it("asks which server to use when both run, proposing the one with models", async () => {
    localMachine({ ollama: [], lmstudio: ["qwen/qwen3.5-9b"] });

    const session = await runSetup([
      LOCAL_CHOICE,
      ENTER, // LM Studio, as proposed
      ...KEEP_ENDPOINT,
      pick("qwen/qwen3.5-9b"),
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect(session.transcript).toContain("Quel serveur local utiliser ?");
    expect(session.transcript).toContain("Ollama (aucun modèle installé)");
    expect(session.transcript).toMatch(/> 2\. LM Studio \(1 modèle installé\)/u);
    expect(await readSavedConfig()).toMatchObject({
      defaultModel: "qwen/qwen3.5-9b",
      providers: { local: { name: "LM Studio", baseUrl: "http://localhost:1234/v1" } },
    });
  });

  it("lets the person type a model the server does not list yet", async () => {
    localMachine({ ollama: ["llama3.2:latest"] });

    await runSetup([
      LOCAL_CHOICE,
      ...KEEP_ENDPOINT,
      pick("Saisir un identifiant manuellement"),
      "qwen3.5:9b",
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect((await readSavedConfig()).defaultModel).toBe("qwen3.5:9b");
  });

  it("gives the pull command for this machine when Ollama has no model", async () => {
    localMachine({ ollama: ["nomic-embed-text:latest"] });

    const session = await runSetup(
      [LOCAL_CHOICE, ...KEEP_ENDPOINT, ENTER, ...KEEP_PREFERENCES, SAVE, NO],
      { totalMemoryBytes: 16 * GIB },
    );

    expect(session.transcript).toContain(
      "! Aucun modèle de conversation n’est installé sur Ollama.",
    );
    expect(session.transcript).toContain(
      "Pour cette machine (16 Go de mémoire), Reqraft recommande qwen3.5:9b, 6,6 à 7,6 Go à télécharger :",
    );
    expect(session.transcript).toContain("$ ollama pull qwen3.5:9b");
    expect((await readSavedConfig()).defaultModel).toBe("qwen3.5:9b");
  });

  it("names the model to search for in LM Studio, which has no pull command", async () => {
    localMachine({ lmstudio: [] });

    const session = await runSetup([
      LOCAL_CHOICE,
      ...KEEP_ENDPOINT,
      ENTER,
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect(session.transcript).toContain(
      "Dans LM Studio, cherche « Qwen3.5 4B », télécharge-le puis charge-le.",
    );
    expect(session.transcript).not.toContain("ollama pull");
  });

  it("lists the models of a local address typed by hand, such as a container's host", async () => {
    const fetchMock = localMachine({});
    fetchMock.mockImplementation((url) =>
      urlOf(url) === "http://host.docker.internal:11434/v1/models"
        ? Promise.resolve(
            new Response(JSON.stringify({ data: [{ id: "gemma4:e4b" }] }), { status: 200 }),
          )
        : Promise.reject(new TypeError("fetch failed")),
    );

    await runSetup([
      LOCAL_CHOICE,
      ENTER, // internal id
      ENTER, // name
      "http://host.docker.internal:11434/v1",
      ENTER, // no key variable
      ENTER, // no custom headers
      pick("gemma4:e4b"),
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect((await readSavedConfig()).defaultModel).toBe("gemma4:e4b");
  });

  it("does not list the catalogue of a hosted gateway", async () => {
    const fetchMock = localMachine({});

    await runSetup([
      pick("OpenAI Compatible"),
      "gateway",
      ENTER, // name
      "https://gateway.example.test/v1",
      ENTER, // no key variable
      ENTER, // no custom headers
      "vendor/model-x",
      ...KEEP_PREFERENCES,
      SAVE,
      NO,
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a model still loading as a timeout, not as an unreachable server", async () => {
    localMachine({
      ollama: ["qwen3.5:4b"],
      completion: () =>
        Promise.reject(
          new DOMException("The operation was aborted due to timeout", "TimeoutError"),
        ),
    });

    const session = await runSetup([
      LOCAL_CHOICE,
      ...KEEP_ENDPOINT,
      ENTER, // qwen3.5:4b
      ...KEEP_PREFERENCES,
      SAVE,
      YES,
    ]);

    expect(session.transcript).toContain(
      "x Test de connexion échoué : Le provider n’a pas répondu dans le délai de 30000 ms. Un modèle local se charge peut-être encore",
    );
    expect(session.transcript).not.toContain("inaccessible");
  });
});
