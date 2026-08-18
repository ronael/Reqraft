import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { bootstrapConfiguration, getBootstrapError } from "@/application/bootstrap.js";

describe("application bootstrap", () => {
  it("loads credentials and config for the UI startup path", async () => {
    const config = { ...DEFAULT_CONFIG, defaultProvider: "openai" as const };
    const result = await bootstrapConfiguration(
      {},
      {
        hydrateCredentials: vi.fn().mockResolvedValue(undefined),
        loadConfig: vi.fn().mockResolvedValue(config),
      },
    );

    expect(result.config).toBe(config);
    expect(getBootstrapError(result)).toBeUndefined();
  });

  it("keeps the config usable while surfacing credential bootstrap errors", async () => {
    const credentialError = new Error("OPENAI_API_KEY contient une valeur d’exemple invalide.");
    const result = await bootstrapConfiguration(
      {},
      {
        hydrateCredentials: vi.fn().mockRejectedValue(credentialError),
        loadConfig: vi.fn().mockResolvedValue(DEFAULT_CONFIG),
      },
    );

    expect(result.config).toBe(DEFAULT_CONFIG);
    expect(getBootstrapError(result)).toBe(credentialError);
  });

  it("falls back to defaults while surfacing corrupted config errors", async () => {
    const configError = new Error("Configuration corrompue");
    const result = await bootstrapConfiguration(
      {},
      {
        hydrateCredentials: vi.fn().mockResolvedValue(undefined),
        loadConfig: vi.fn().mockRejectedValue(configError),
      },
    );

    expect(result.config).toBe(DEFAULT_CONFIG);
    expect(getBootstrapError(result)).toBe(configError);
  });
});
