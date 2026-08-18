import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_PROVIDER_IDS,
  getProviderDefinition,
  getProviderEnvName,
  isCredentialProvider,
  listCredentialProviders,
  listProviderDefinitions,
} from "@/providers/catalog.js";
import { getInitProviderChoices } from "@/commands/first-run.js";

describe("provider catalog", () => {
  it("defines every built-in provider exactly once", () => {
    const definitions = listProviderDefinitions();
    const ids = definitions.map((definition) => definition.id);

    expect(ids).toEqual([...BUILTIN_PROVIDER_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires env names for providers using secure auth", () => {
    const credentialProviders = listCredentialProviders();

    expect(credentialProviders.map((provider) => provider.id)).toEqual([
      "anthropic",
      "openai",
      "deepseek",
      "mistral",
    ]);
    for (const provider of credentialProviders) {
      expect(provider.apiKeyEnvName).toMatch(/_API_KEY$/);
      expect(getProviderEnvName(provider.id)).toBe(provider.apiKeyEnvName);
      expect(isCredentialProvider(provider.id)).toBe(true);
    }
  });

  it("keeps init and auth visibility explicit", () => {
    expect(getProviderDefinition("mock").visibleInInit).toBe(false);
    expect(getProviderDefinition("mock").supportsSecureAuth).toBe(false);
    expect(getProviderDefinition("openai-compatible").visibleInInit).toBe(true);
    expect(getProviderDefinition("openai-compatible").supportsSecureAuth).toBe(false);
    expect(isCredentialProvider("openai-compatible")).toBe(false);
  });

  it("uses the catalog for init provider choices", () => {
    expect(getInitProviderChoices().map((choice) => choice.provider)).toEqual([
      "anthropic",
      "openai",
      "deepseek",
      "mistral",
      "openai-compatible",
      "openai-compatible",
    ]);
  });

  it("does not redeclare provider env or label maps in command modules", async () => {
    const commandSources = await Promise.all([
      readFile("src/commands/first-run.ts", "utf8"),
      readFile("src/commands/doctor.ts", "utf8"),
      readFile("src/auth/credentials.ts", "utf8"),
    ]);

    for (const source of commandSources) {
      expect(source).not.toMatch(/const\s+PROVIDER_ENV\s*=/);
      expect(source).not.toMatch(/const\s+PROVIDER_LABEL\s*=/);
    }
  });
});
