import { describe, expect, it } from "vitest";
import type { ProviderAdapter } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/config/loader.js";
import { buildDoctorReport } from "../../src/desktop/main/doctor.js";

function healthyProvider(): ProviderAdapter {
  return {
    id: "mock",
    name: "Mock",
    generate: () => Promise.resolve({ text: "" }),
    validateConfiguration: () => Promise.resolve({ ok: true }),
  };
}

function unhealthyProvider(missing: string): ProviderAdapter {
  return {
    id: "mock",
    name: "Mock",
    generate: () => Promise.resolve({ text: "" }),
    validateConfiguration: () =>
      Promise.resolve({
        ok: false,
        code: "missing_configuration",
        missingConfiguration: [missing],
      }),
  };
}

describe("buildDoctorReport (lot 5)", () => {
  it("produit un rapport structuré : config + santé des providers", async () => {
    const report = await buildDoctorReport({
      loadConfig: () => Promise.resolve(DEFAULT_CONFIG),
      configPath: () => "/Users/test/.config/reqraft/config.json",
      hydrateCredentials: () => Promise.resolve(),
      createProvider: healthyProvider,
      providerIds: ["mock"],
      env: {},
    });

    const byId = new Map(report.checks.map((check) => [check.id, check]));
    expect(byId.get("config:file")).toMatchObject({
      ok: true,
      detail: "/Users/test/.config/reqraft/config.json",
    });
    expect(byId.get("provider:mock")).toMatchObject({ ok: true });
  });

  it("un provider mal configuré est KO avec le détail, jamais la clé", async () => {
    const report = await buildDoctorReport({
      loadConfig: () => Promise.resolve(DEFAULT_CONFIG),
      configPath: () => "/Users/test/.config/reqraft/config.json",
      hydrateCredentials: () => Promise.resolve(),
      createProvider: () => unhealthyProvider("OPENAI_API_KEY"),
      providerIds: ["openai"],
      env: { OPENAI_API_KEY: "sk-ne-jamais-afficher" },
    });

    const check = report.checks.find((entry) => entry.id === "provider:openai");
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain("OPENAI_API_KEY");
    expect(JSON.stringify(report)).not.toContain("sk-ne-jamais-afficher");
  });

  it("un provider qui lève une erreur est KO proprement", async () => {
    const report = await buildDoctorReport({
      loadConfig: () => Promise.resolve(DEFAULT_CONFIG),
      configPath: () => "/Users/test/.config/reqraft/config.json",
      hydrateCredentials: () => Promise.resolve(),
      createProvider: () => {
        throw new Error("init impossible");
      },
      providerIds: ["anthropic"],
      env: {},
    });

    const check = report.checks.find((entry) => entry.id === "provider:anthropic");
    expect(check?.ok).toBe(false);
  });
});
