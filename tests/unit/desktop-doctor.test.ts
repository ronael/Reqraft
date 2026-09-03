import { describe, expect, it, vi } from "vitest";
import type { ProviderAdapter } from "@/core/types.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import { buildDoctorReport, formatDoctorReport } from "@/apps/desktop/main/doctor.js";

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
    expect(check?.remedy).toBe("configure-provider");
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

  it("contrôle par défaut le seul provider actif", async () => {
    const createProvider = vi.fn(() => healthyProvider());
    const report = await buildDoctorReport({
      loadConfig: () => Promise.resolve({ ...DEFAULT_CONFIG, defaultProvider: "mock" }),
      hydrateCredentials: () => Promise.resolve(),
      createProvider,
      env: {},
    });

    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(createProvider).toHaveBeenCalledWith("mock", {}, expect.any(Object));
    expect(report.checks.filter((check) => check.id.startsWith("provider:"))).toEqual([
      { id: "provider:mock", ok: true },
    ]);
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
        suspended: true,
      },
    });

    const byId = new Map(report.checks.map((check) => [check.id, check]));
    expect(byId.get("permissions:accessibility")).toMatchObject({ ok: true });
    expect(byId.get("permissions:automation")).toMatchObject({
      ok: false,
      detail: "Accessibilité accordée, Automatisation refusée.",
      remedy: "grant-automation",
    });
    expect(byId.get("permissions:replace")).toMatchObject({
      ok: false,
      remedy: "grant-permissions",
    });
    expect(byId.get("shortcuts:capture")).toMatchObject({
      ok: true,
      detail: "⌃⌥R (Control+Alt+R)",
    });
    expect(byId.get("shortcuts:input")).toMatchObject({ ok: true });
    expect(byId.get("shortcuts:popover")).toMatchObject({ ok: true });
    expect(byId.get("shortcuts:rejected")).toMatchObject({
      ok: false,
      detail: "rejected by the system: Alt+Space",
      remedy: "free-shortcut",
    });
    expect(byId.get("shortcuts:conflicts")).toMatchObject({
      ok: false,
      detail: "already used by another Reqraft command: Command+Alt+K",
      remedy: "resolve-shortcut-conflict",
    });
    expect(byId.get("shortcuts:suspended")).toMatchObject({
      ok: false,
      detail: "global shortcuts suspended from the menu bar",
      remedy: "resume-shortcuts",
    });
    expect(JSON.stringify(report)).not.toContain("sk-ne-jamais-afficher");
  });

  it("annonce le mode plancher Wayland sans proposer un réglage macOS", async () => {
    const report = await buildDoctorReport({
      loadConfig: () => Promise.resolve(DEFAULT_CONFIG),
      hydrateCredentials: () => Promise.resolve(),
      createProvider: healthyProvider,
      providerIds: ["mock"],
      env: {},
      permissions: {
        accessibility: false,
        automation: false,
        canReplace: false,
        gap: "wayland",
        message: "Wayland floor mode",
      },
    });

    const permissionChecks = report.checks.filter((check) => check.id.startsWith("permissions:"));
    expect(permissionChecks).toHaveLength(3);
    expect(permissionChecks.every((check) => check.remedy === "wayland-floor")).toBe(true);
  });
});

describe("formatDoctorReport (rapport copiable)", () => {
  it("rend un texte stable : entête, version, plateforme puis un check par ligne", () => {
    const text = formatDoctorReport(
      {
        checks: [
          { id: "config:defaults", ok: true, detail: "openai · gpt-4o · general" },
          { id: "provider:openai", ok: false, detail: "OPENAI_API_KEY" },
        ],
      },
      { version: "0.5.0", platform: "darwin" },
    );

    expect(text).toBe(
      [
        "Reqraft diagnostic",
        "version: 0.5.0",
        "platform: darwin",
        "",
        "- [ok] config:defaults: openai · gpt-4o · general",
        "- [fail] provider:openai: OPENAI_API_KEY",
        "",
      ].join("\n"),
    );
  });

  it("omet version et plateforme quand elles ne sont pas fournies", () => {
    const text = formatDoctorReport({ checks: [{ id: "config:file", ok: true }] });

    expect(text).toBe(["Reqraft diagnostic", "", "- [ok] config:file", ""].join("\n"));
  });

  it("écrit un check sans détail sans séparateur orphelin", () => {
    const text = formatDoctorReport({ checks: [{ id: "provider:mock", ok: true }] });

    expect(text).toContain("- [ok] provider:mock\n");
    expect(text).not.toContain("provider:mock:");
  });

  it("n'utilise que des fins de ligne LF et termine par un saut", () => {
    const text = formatDoctorReport(
      {
        checks: [
          { id: "a", ok: true },
          { id: "b", ok: false },
        ],
      },
      { version: "0.5.0", platform: "win32" },
    );

    expect(text).not.toContain("\r");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("remplace le dossier personnel par ~ : un rapport part dans une issue publique", () => {
    const text = formatDoctorReport(
      {
        checks: [
          { id: "config:file", ok: true, detail: "/Users/prenom.nom/.config/reqraft/config.json" },
        ],
      },
      { homeDir: "/Users/prenom.nom" },
    );

    expect(text).toContain("~/.config/reqraft/config.json");
    expect(text).not.toContain("prenom.nom");
  });

  it("ne casse pas la liste avec un détail multiligne et tronque l'anormal", () => {
    const text = formatDoctorReport({
      checks: [
        { id: "one", ok: false, detail: "première ligne\nseconde ligne" },
        { id: "two", ok: false, detail: "x".repeat(400) },
      ],
    });

    expect(text).toContain("- [fail] one: première ligne seconde ligne");
    expect(text.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(2);
    expect(text).toContain(`- [fail] two: ${"x".repeat(200)}…`);
  });

  it("ne fait apparaître aucune sentinelle de clé, d'en-tête ou d'exception", async () => {
    // Le rapport est sanitizé par construction : ce test vérifie la chaîne
    // complète, du provider qui explose jusqu'au texte copié.
    const report = await buildDoctorReport({
      loadConfig: () => Promise.resolve(DEFAULT_CONFIG),
      configPath: () => "/Users/prenom.nom/.config/reqraft/config.json",
      hydrateCredentials: () => Promise.resolve(),
      createProvider: () => {
        throw new Error("boom-message-exception sk-sentinelle");
      },
      providerIds: ["openai"],
      env: {
        OPENAI_API_KEY: "sk-sentinelle-de-cle",
        REQRAFT_CUSTOM_HEADER: "x-sentinelle-header",
      },
    });

    const text = formatDoctorReport(report, {
      version: "0.5.0",
      platform: "darwin",
      homeDir: "/Users/prenom.nom",
    });

    expect(text).not.toContain("sk-sentinelle");
    expect(text).not.toContain("x-sentinelle-header");
    expect(text).not.toContain("boom-message-exception");
    expect(text).not.toContain("prenom.nom");
    expect(text).toContain("- [fail] provider:openai");
  });
});
