import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWindowsCredentialStore } from "@/apps/desktop/main/windows-credential-store.js";

const directories: string[] = [];

async function fixture(available = true) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reqraft-windows-credentials-"));
  directories.push(directory);
  const filePath = path.join(directory, "credentials.json");
  const safeStorage = {
    isEncryptionAvailable: () => {
      return available;
    },
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value: Buffer) => {
      return value.toString("utf8").replace(/^encrypted:/, "");
    },
  };
  return { filePath, store: createWindowsCredentialStore({ filePath, safeStorage }) };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true });
    }),
  );
});

describe("Windows desktop credential store", () => {
  it("persists only an encrypted representation and hydrates it", async () => {
    const { filePath, store } = await fixture();
    await store.set("anthropic", "secret-value");

    const contents = await readFile(filePath, "utf8");
    expect(contents).not.toContain("secret-value");

    const env: NodeJS.ProcessEnv = {};
    await store.hydrate(env);
    expect(env.ANTHROPIC_API_KEY).toBe("secret-value");
  });

  it("keeps an explicit environment variable ahead of secure storage", async () => {
    const { store } = await fixture();
    await store.set("openai", "stored-value");
    const env = { OPENAI_API_KEY: "environment-value" };

    await store.hydrate(env);

    expect(env.OPENAI_API_KEY).toBe("environment-value");
  });

  it("removes a credential without affecting the others", async () => {
    const { store } = await fixture();
    await store.set("anthropic", "anthropic-value");
    await store.set("openai", "openai-value");
    await store.delete("anthropic");
    const env: NodeJS.ProcessEnv = {};

    await store.hydrate(env);

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBe("openai-value");
  });

  it("stays unavailable when DPAPI encryption cannot initialize", async () => {
    const { store } = await fixture(false);

    expect(store.available).toBe(false);
    await expect(store.set("anthropic", "secret-value")).rejects.toThrow(/unavailable/);
  });
});
