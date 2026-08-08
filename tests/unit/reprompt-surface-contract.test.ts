import { describe, expect, it } from "vitest";
import { createCliRepromptInput } from "../../src/commands/reprompt.js";
import { DEFAULT_CONFIG } from "../../src/config/loader.js";
import type { Config } from "../../src/config/schema.js";
import { createUiRepromptInput } from "../../src/ui/app-actions.js";
import { createInitialAppState } from "../../src/ui/app-state.js";

describe("reprompt surface contract", () => {
  it("keeps the quick CLI and TUI aligned for the same configured request", () => {
    const input = "bonjour voici les docs pour la campagne, cordialement";
    const config: Config = {
      ...DEFAULT_CONFIG,
      defaultProvider: "openai",
      defaultModel: "gpt-5-mini",
      defaultProfile: "auto",
      defaultLevel: "standard",
      fidelityMode: "balanced",
      timeoutMs: 30_000,
      maxOutputTokens: 800,
    };
    const env = { OPENAI_API_KEY: "redacted" };
    const state = {
      ...createInitialAppState(config),
      input,
    };

    expect(createCliRepromptInput(input, config, {}, env)).toEqual(
      createUiRepromptInput(state, config, env),
    );
  });

  it("keeps CLI overrides explicit instead of mutating configuration defaults", () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      defaultProvider: "anthropic",
      defaultModel: "claude-haiku-4-5",
      defaultProfile: "auto",
      defaultLevel: "standard",
      stream: true,
      fidelityMode: "balanced",
      timeoutMs: 30_000,
    };

    expect(
      createCliRepromptInput(
        "corrige ce composant",
        config,
        {
          profile: "frontend",
          level: "complete",
          provider: "mock",
          model: "mock-model",
          stream: false,
          fidelity: "strict",
          timeout: "5000",
          maxOutputTokens: "300",
        },
        {},
      ),
    ).toMatchObject({
      input: "corrige ce composant",
      profileId: "frontend",
      level: "complete",
      providerId: "mock",
      requestedModel: "mock-model",
      defaultModel: "claude-haiku-4-5",
      stream: false,
      fidelityMode: "strict",
      timeoutMs: 5_000,
      maxOutputTokens: 300,
    });
  });

  it("uses the provider fallback model like the TUI when the quick CLI changes provider", () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      defaultProvider: "openai",
      defaultModel: "gpt-4.1-mini",
      defaultProfile: "auto",
      defaultLevel: "standard",
    };

    expect(
      createCliRepromptInput("corrige ce prompt", config, { provider: "anthropic" }, {}),
    ).toMatchObject({
      providerId: "anthropic",
      requestedModel: "claude-haiku-4-5",
      defaultModel: "gpt-4.1-mini",
    });
  });

  it("keeps an explicit quick CLI model even when the provider is overridden", () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      defaultProvider: "openai",
      defaultModel: "gpt-4.1-mini",
      defaultProfile: "auto",
      defaultLevel: "standard",
    };

    expect(
      createCliRepromptInput(
        "corrige ce prompt",
        config,
        { provider: "anthropic", model: "claude-sonnet-5" },
        {},
      ).requestedModel,
    ).toBe("claude-sonnet-5");
  });
});
