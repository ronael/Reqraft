import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatSizeRange, recommendLocalModel } from "@/models/local-recommendation.js";
import { isLocalEndpoint, localServerKind } from "@/providers/local-endpoint.js";
import { chatModels, detectLocalServers, listInstalledModels } from "@/providers/local-servers.js";

const GIB = 1024 ** 3;
const fetchMock = vi.fn<typeof fetch>();

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function models(...ids: string[]): Response {
  return new Response(JSON.stringify({ object: "list", data: ids.map((id) => ({ id })) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("detectLocalServers", () => {
  it("looks for Ollama and LM Studio on their default ports and lists their chat models", async () => {
    fetchMock.mockImplementation((url) =>
      urlOf(url).startsWith("http://localhost:11434/")
        ? Promise.resolve(models("qwen3.5:4b", "nomic-embed-text:latest"))
        : Promise.reject(new TypeError("fetch failed")),
    );

    await expect(detectLocalServers()).resolves.toEqual([
      {
        kind: "ollama",
        label: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        port: 11434,
        reachable: true,
        models: ["qwen3.5:4b"],
      },
      {
        kind: "lmstudio",
        label: "LM Studio",
        baseUrl: "http://localhost:1234/v1",
        port: 1234,
        reachable: false,
        models: [],
      },
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:11434/v1/models",
      "http://localhost:1234/v1/models",
    ]);
  });

  it("gives every probe a deadline, so a port held by something else cannot hang the setup", async () => {
    fetchMock.mockResolvedValue(models());

    await detectLocalServers(250);

    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("reports a server that answers with an error as unreachable", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("nope", { status: 500 })));

    const servers = await detectLocalServers();

    expect(servers.map((server) => server.reachable)).toEqual([false, false]);
  });
});

describe("listInstalledModels", () => {
  it("authenticates like the provider would and leaves embedding models out", async () => {
    fetchMock.mockResolvedValue(
      models("text-embedding-nomic-embed-text-v1.5", "qwen/qwen3.5-9b", "qwen/qwen3.5-9b"),
    );

    await expect(
      listInstalledModels({
        baseUrl: "http://host.docker.internal:1234/v1",
        label: "LM Studio",
        apiKey: "lan-test-key",
      }),
    ).resolves.toEqual(["qwen/qwen3.5-9b"]);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer lan-test-key",
    );
  });

  it("lets the caller decide what an unreachable server means", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      listInstalledModels({ baseUrl: "http://localhost:11434/v1", label: "Ollama" }),
    ).rejects.toMatchObject({ errorCode: "provider.request_failed" });
  });
});

describe("chatModels", () => {
  it("drops embedding models and duplicates, in the server's order", () => {
    expect(chatModels(["b", "all-minilm-embed", "a", "b"])).toEqual(["b", "a"]);
  });
});

describe("isLocalEndpoint and localServerKind", () => {
  it("recognises the default ports of Ollama and LM Studio on a local host", () => {
    expect(localServerKind("http://localhost:11434/v1")).toBe("ollama");
    expect(localServerKind("http://127.0.0.1:1234/v1/")).toBe("lmstudio");
    expect(localServerKind("http://localhost:8080/v1")).toBeUndefined();
    // The same port on a public host is not a local server.
    expect(localServerKind("https://example.test:11434/v1")).toBeUndefined();
  });

  it("refuses what is not a URL", () => {
    expect(isLocalEndpoint("localhost:11434")).toBe(false);
    expect(isLocalEndpoint("")).toBe(false);
  });

  // The private ranges are the subject here, so their addresses are spelt out.
  // eslint-disable-next-line sonarjs/no-hardcoded-ip -- test data for the ranges isLocalEndpoint accepts
  it.each(["10.0.0.5", "172.16.3.4", "172.31.0.1", "169.254.1.1", "[fd12::1]", "[fe80::1]"])(
    "treats the private address %s as local",
    (host) => {
      expect(isLocalEndpoint(`http://${host}:11434/v1`)).toBe(true);
    },
  );

  // eslint-disable-next-line sonarjs/no-hardcoded-ip -- test data just outside those ranges
  it.each(["172.32.0.1", "8.8.8.8", "[2001:db8::1]", "ollama.example.com"])(
    "treats the public address %s as hosted",
    (host) => {
      expect(isLocalEndpoint(`https://${host}/v1`)).toBe(false);
    },
  );
});

describe("recommendLocalModel", () => {
  it("recommends the 4B model below 16 GB of memory", () => {
    expect(recommendLocalModel(8 * GIB)).toEqual({
      id: "qwen3.5:4b",
      sizeGb: { min: 3.3, max: 4 },
      memoryGb: 8,
      pullCommand: "ollama pull qwen3.5:4b",
      searchTerm: "Qwen3.5 4B",
    });
  });

  it("recommends the 9B model from 16 GB, even when the machine reports a little less", () => {
    expect(recommendLocalModel(15.6 * GIB).id).toBe("qwen3.5:9b");
    expect(recommendLocalModel(32 * GIB)).toMatchObject({
      id: "qwen3.5:9b",
      memoryGb: 32,
      pullCommand: "ollama pull qwen3.5:9b",
    });
  });

  it("writes the size with the reader's decimal mark", () => {
    expect(formatSizeRange({ min: 3.3, max: 4 }, "fr")).toBe("3,3–4");
    expect(formatSizeRange({ min: 6.6, max: 7.6 }, "en")).toBe("6.6–7.6");
  });
});
