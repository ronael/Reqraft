import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../../src/config/schema.js";
import {
  buildApiKeyStatus,
  buildShellInstructions,
  buildPostInitSecurityNote,
  buildSummary,
  createInitConfig,
  getInitProviderChoices,
} from "../../src/commands/first-run.js";
import { saveConfig } from "../../src/config/loader.js";

describe("init assistant helpers", () => {
  it("does not expose the mock provider to users", () => {
    expect(getInitProviderChoices().map((choice) => choice.provider)).toEqual([
      "anthropic",
      "openai",
      "deepseek",
      "mistral",
      "openai-compatible",
      "openai-compatible",
    ]);
    expect(getInitProviderChoices().map((choice) => choice.label)).not.toContain("Mock");
  });

  it("detects API key presence without exposing values", () => {
    const status = buildApiKeyStatus("anthropic", { ANTHROPIC_API_KEY: "secret-value" });

    expect(status.envName).toBe("ANTHROPIC_API_KEY");
    expect(status.detected).toBe(true);
    expect(status.message).toBe("ANTHROPIC_API_KEY détectée.");
    expect(status.message).not.toContain("secret-value");
  });

  it("builds shell instructions without embedding a real key", () => {
    const instructions = buildShellInstructions("ANTHROPIC_API_KEY", "/bin/zsh");

    expect(instructions).toContain('export ANTHROPIC_API_KEY="votre-clé"');
    expect(instructions).toContain("~/.zshrc");
    expect(instructions).not.toContain("secret-value");
  });

  it("creates an OpenAI-compatible config without storing API keys", () => {
    const config = createInitConfig({
      provider: "openai-compatible",
      model: "custom-model",
      profile: "auto",
      level: "standard",
      copyAfterGeneration: false,
      stream: true,
      timeoutMs: 30000,
      compatibleProvider: {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKeyEnv: "OPENROUTER_API_KEY",
      },
    });

    expect(config.providers?.openrouter).toEqual({
      type: "openai-compatible",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnv: "OPENROUTER_API_KEY",
    });
    expect(JSON.stringify(config)).not.toContain('"apiKey":');
    expect(JSON.stringify(config)).not.toContain("secret-value");
  });

  it("summarizes key state without exposing values", () => {
    const summary = buildSummary(
      createInitConfig({
        provider: "anthropic",
        model: "claude-haiku-4-5",
        profile: "auto",
        level: "standard",
        copyAfterGeneration: false,
        stream: true,
        timeoutMs: 30000,
      }),
      { envName: "ANTHROPIC_API_KEY", detected: true, message: "ANTHROPIC_API_KEY détectée." },
    );

    expect(summary).toContain("Clé API");
    expect(summary).toContain("détectée dans ANTHROPIC_API_KEY");
    expect(summary).not.toContain("secret-value");
  });

  it("explains after init why missing keys were not requested", () => {
    const note = buildPostInitSecurityNote({
      envName: "OPENAI_API_KEY",
      detected: false,
      message: "OPENAI_API_KEY non détectée.",
    });

    expect(note).toContain("Reqraft ne t'a pas demandé ta clé API");
    expect(note).toContain("OPENAI_API_KEY");
    expect(note).toContain("export OPENAI_API_KEY");
    expect(note).not.toContain("secret-value");
  });
});

describe("config schema and saving", () => {
  it("accepts custom OpenAI-compatible providers but rejects stored API keys", () => {
    expect(() =>
      ConfigSchema.parse({
        defaultProvider: "openai-compatible",
        defaultModel: "custom-model",
        defaultProfile: "auto",
        defaultLevel: "standard",
        copyAfterGeneration: false,
        stream: true,
        timeoutMs: 30000,
        telemetry: false,
        providers: {
          custom: {
            type: "openai-compatible",
            baseUrl: "https://example.com/v1",
            apiKeyEnv: "CUSTOM_API_KEY",
          },
        },
      }),
    ).not.toThrow();

    expect(() =>
      ConfigSchema.parse({
        providers: {
          custom: {
            type: "openai-compatible",
            baseUrl: "https://example.com/v1",
            apiKey: "secret-value",
          },
        },
      }),
    ).toThrow();
  });

  it("saves config atomically through a temporary file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "rp-config-"));
    const target = path.join(dir, "config.json");

    await saveConfig(
      createInitConfig({
        provider: "anthropic",
        model: "claude-haiku-4-5",
        profile: "auto",
        level: "standard",
        copyAfterGeneration: false,
        stream: true,
        timeoutMs: 30000,
      }),
      target,
    );

    const saved = JSON.parse(await readFile(target, "utf8")) as unknown;
    expect(ConfigSchema.parse(saved).defaultProvider).toBe("anthropic");
  });
});
