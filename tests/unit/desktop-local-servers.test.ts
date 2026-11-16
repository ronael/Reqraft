import { describe, expect, it, vi } from "vitest";
import {
  knownResponse,
  localAdvice,
  proposedModel,
  proposeLocalSetup,
  runningServers,
  searchAgain,
  serverAt,
  type LocalDetection,
} from "@/apps/desktop/renderer/onboarding/local-servers.js";
import { registerIpcHandlers } from "@/apps/desktop/main/ipc.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import type {
  LocalServerEntry,
  LocalServersDetectResponse,
} from "@/apps/desktop/shared/ipc-contract.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { DetectedLocalServer } from "@/providers/local-servers.js";
import { createFakeSender, FakeIpcMain } from "./desktop-ipc-harness.js";

const OLLAMA_URL = "http://localhost:11434/v1";
const LMSTUDIO_URL = "http://localhost:1234/v1";
const GIB = 1024 ** 3;

function server(kind: "ollama" | "lmstudio", models: string[] | null): LocalServerEntry {
  return {
    kind,
    label: kind === "ollama" ? "Ollama" : "LM Studio",
    baseUrl: kind === "ollama" ? OLLAMA_URL : LMSTUDIO_URL,
    reachable: models !== null,
    models: (models ?? []).map((id) => ({ id, name: id })),
  };
}

function detected(ollama: string[] | null, lmstudio: string[] | null): LocalDetection {
  return {
    status: "done",
    response: {
      servers: [server("ollama", ollama), server("lmstudio", lmstudio)],
      recommendation: {
        model: "qwen3.5:4b",
        sizeGb: { min: 3.3, max: 4 },
        memoryGb: 8,
        pullCommand: "ollama pull qwen3.5:4b",
        searchTerm: "Qwen3.5 4B",
      },
    },
  };
}

describe("serverAt", () => {
  it("finds the running server a base URL names, trailing slash or not", () => {
    const detection = detected(["llama3.2"], null);

    expect(serverAt(detection, `${OLLAMA_URL}/`)?.kind).toBe("ollama");
    expect(serverAt(detection, LMSTUDIO_URL)).toBeUndefined();
    expect(serverAt({ status: "searching" }, OLLAMA_URL)).toBeUndefined();
  });
});

describe("searchAgain", () => {
  it("keeps the last answer on screen while the search runs again", () => {
    const done = detected(["llama3.2"], null);
    const searching = searchAgain(done);

    expect(searching.status).toBe("searching");
    expect(knownResponse(searching)).toBe(knownResponse(done));
    expect(runningServers(searching).map((server) => server.kind)).toEqual(["ollama"]);
    expect(searchAgain(searching)).toEqual(searching);
  });

  it("starts empty when nothing was found yet", () => {
    expect(searchAgain({ status: "idle" })).toEqual({ status: "searching" });
    expect(searchAgain({ status: "failed" })).toEqual({ status: "searching" });
  });
});

describe("proposedModel", () => {
  const ollama = server("ollama", ["llama3.2", "qwen3.5:4b"]);

  it("keeps a model the server has, else proposes the recommended one, else its first", () => {
    expect(proposedModel(ollama, "qwen3.5:4b", "llama3.2")).toBe("llama3.2");
    expect(proposedModel(ollama, "qwen3.5:4b", "claude-haiku-4-5")).toBe("qwen3.5:4b");
    expect(proposedModel(ollama, "qwen3.5:9b", "")).toBe("llama3.2");
  });

  it("fills an empty field with the recommended model where there is none to pick", () => {
    expect(proposedModel(server("ollama", []), "qwen3.5:4b", "")).toBe("qwen3.5:4b");
    expect(proposedModel(undefined, "qwen3.5:4b", "")).toBe("qwen3.5:4b");
    expect(proposedModel(undefined, "qwen3.5:4b", "my-model")).toBe("my-model");
  });
});

describe("proposeLocalSetup", () => {
  it("moves the untouched default to the only server running", () => {
    expect(
      proposeLocalSetup(
        { compatibleBaseUrl: OLLAMA_URL, model: "" },
        detected(null, ["qwen/qwen3.5-9b"]),
        OLLAMA_URL,
      ),
    ).toEqual({ compatibleBaseUrl: LMSTUDIO_URL, model: "qwen/qwen3.5-9b" });
  });

  it("prefers the running server that has models", () => {
    expect(
      proposeLocalSetup(
        { compatibleBaseUrl: "http://localhost:11434/v1/", model: "" },
        detected([], ["qwen/qwen3.5-9b"]),
        OLLAMA_URL,
      ),
    ).toMatchObject({ model: "qwen3.5:4b" });
  });

  it("leaves an address someone typed alone", () => {
    expect(
      proposeLocalSetup(
        { compatibleBaseUrl: "http://host.docker.internal:11434/v1", model: "gemma4:e4b" },
        detected(null, ["qwen/qwen3.5-9b"]),
        OLLAMA_URL,
      ),
    ).toEqual({});
  });

  it("changes nothing until the search answered", () => {
    expect(
      proposeLocalSetup(
        { compatibleBaseUrl: OLLAMA_URL, model: "" },
        { status: "failed" },
        OLLAMA_URL,
      ),
    ).toEqual({});
  });
});

describe("localAdvice", () => {
  it("gives the pull command for Ollama without a model", () => {
    expect(localAdvice(detected([], null), OLLAMA_URL)).toEqual({ kind: "pull", server: "Ollama" });
  });

  it("names the search for LM Studio without a model", () => {
    expect(localAdvice(detected(null, []), LMSTUDIO_URL)).toEqual({
      kind: "search",
      server: "LM Studio",
    });
  });

  it("starts with Ollama itself when nothing answers at its address", () => {
    expect(localAdvice(detected(null, null), OLLAMA_URL)).toEqual({ kind: "install" });
  });

  it("says nothing when there is a model to pick, or for an address of one's own", () => {
    expect(localAdvice(detected(["llama3.2"], null), OLLAMA_URL)).toBeUndefined();
    expect(
      localAdvice(detected(null, null), "http://host.docker.internal:11434/v1"),
    ).toBeUndefined();
    expect(localAdvice(detected(null, null), LMSTUDIO_URL)).toBeUndefined();
    expect(localAdvice({ status: "failed" }, OLLAMA_URL)).toBeUndefined();
  });
});

describe("local-servers:detect", () => {
  function mainProcess(options: { servers: DetectedLocalServer[]; memory: number }): FakeIpcMain {
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers({
      ipcMain,
      clipboard: { writeText: vi.fn() },
      env: {},
      loadConfig: () => Promise.resolve(DEFAULT_CONFIG),
      saveConfig: () => Promise.resolve(),
      hydrateCredentials: () => Promise.resolve(),
      detectLocalServers: () => Promise.resolve(options.servers),
      totalMemoryBytes: () => options.memory,
    });
    return ipcMain;
  }

  it("answers with the servers found, their models cleaned, and the model for this memory", async () => {
    const ipcMain = mainProcess({
      memory: 16 * GIB,
      servers: [
        {
          kind: "ollama",
          label: "Ollama",
          baseUrl: OLLAMA_URL,
          port: 11434,
          reachable: true,
          models: ["qwen3.5:9b", "not a model id", "qwen3.5:9b"],
        },
        {
          kind: "lmstudio",
          label: "LM Studio",
          baseUrl: LMSTUDIO_URL,
          port: 1234,
          reachable: false,
          models: [],
        },
      ],
    });

    const response = (await ipcMain.invoke(
      IPC_CHANNELS.localServersDetect,
      undefined,
      createFakeSender().sender,
    )) as LocalServersDetectResponse;

    expect(response).toEqual({
      servers: [
        {
          kind: "ollama",
          label: "Ollama",
          baseUrl: OLLAMA_URL,
          reachable: true,
          models: [{ id: "qwen3.5:9b", name: "qwen3.5:9b" }],
        },
        {
          kind: "lmstudio",
          label: "LM Studio",
          baseUrl: LMSTUDIO_URL,
          reachable: false,
          models: [],
        },
      ],
      recommendation: {
        model: "qwen3.5:9b",
        sizeGb: { min: 6.6, max: 7.6 },
        memoryGb: 16,
        pullCommand: "ollama pull qwen3.5:9b",
        searchTerm: "Qwen3.5 9B",
      },
    });
  });

  it("refuses an address from the renderer: there is nothing to name", async () => {
    const ipcMain = mainProcess({ memory: 8 * GIB, servers: [] });

    await expect(
      ipcMain.invoke(
        IPC_CHANNELS.localServersDetect,
        { baseUrl: "http://example.test/v1" },
        createFakeSender().sender,
      ),
    ).rejects.toThrow();
  });
});
