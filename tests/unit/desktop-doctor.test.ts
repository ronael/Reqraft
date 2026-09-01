import { describe, expect, it } from "vitest";
import type { ProviderAdapter } from "@/core/types.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { buildDoctorReport } from "@/apps/desktop/main/doctor.js";

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

  it("inclut l'état runtime des permissions et raccourcis quand il est fourni", async () => {
    const report = await buildDoctorReport({
      loadConfig: () => Promise.resolve(DEFAULT_CONFIG),
      configPath: () => "/Users/test/.config/reqraft/config.json",
      hydrateCredentials: () => Promise.resolve(),
      createProvider: healthyProvider,
      providerIds: ["mock"],
      env: { OPENAI_API_KEY: "sk-ne-jamais-afficher" },
      permissions: {
        accessibility: true,
        automation: false,
        canReplace: false,
        gap: "automation",
        message: "Accessibilité accordée, Automatisation refusée.",
      },
      shortcuts: {
        registered: [
          { accelerator: "Control+Alt+R", label: "⌃⌥R", intent: "capture" },
          { accelerator: "Control+Shift+R", label: "⌃⇧R", intent: "input" },
          { accelerator: "Command+Control+O", label: "⌘⌃O", intent: "popover" },
        ],
        rejected: ["Alt+Space"],
        conflicts: ["Command+Alt+K"],
      },
    });

    const byId = new Map(report.checks.map((check) => [check.id, check]));
    expect(byId.get("permissions:accessibility")).toMatchObject({ ok: true });
    expect(byId.get("permissions:automation")).toMatchObject({
      ok: false,
      detail: "Accessibilité accordée, Automatisation refusée.",
    });
    expect(byId.get("permissions:replace")).toMatchObject({ ok: false });
    expect(byId.get("shortcuts:capture")).toMatchObject({
      ok: true,
      detail: "⌃⌥R (Control+Alt+R)",
    });
    expect(byId.get("shortcuts:input")).toMatchObject({ ok: true });
    expect(byId.get("shortcuts:popover")).toMatchObject({ ok: true });
    expect(byId.get("shortcuts:rejected")).toMatchObject({
      ok: false,
      detail: "rejected by the system: Alt+Space",
    });
    expect(byId.get("shortcuts:conflicts")).toMatchObject({
      ok: false,
      detail: "already used by another Reqraft command: Command+Alt+K",
    });
    expect(JSON.stringify(report)).not.toContain("sk-ne-jamais-afficher");
  });
});
