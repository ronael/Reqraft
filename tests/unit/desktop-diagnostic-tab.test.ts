import { describe, expect, it } from "vitest";
import {
  diagnosticCheckLabel,
  diagnosticMessage,
  diagnosticTone,
} from "@/apps/desktop/renderer/settings/DiagnosticTab.js";
import {
  diagnosticRemedy,
  permissionPaneOf,
  targetTabOf,
} from "@/apps/desktop/renderer/settings/diagnostic-remedies.js";
import { DOCTOR_REMEDIES } from "@/apps/desktop/shared/ipc-contract.js";
import type { Translate } from "@/apps/desktop/renderer/shared/i18n.js";

const t: Translate = (key, params) =>
  params?.provider === undefined ? key : `${key}:${params.provider}`;

describe("desktop diagnostic labels", () => {
  it("replaces internal check ids with interface labels", () => {
    expect(diagnosticCheckLabel("config:file", t)).toBe("settings.diagnosticConfigFile");
    expect(diagnosticCheckLabel("shortcuts:capture", t)).toBe("settings.captureShortcut");
    expect(diagnosticCheckLabel("provider:anthropic", t)).toBe(
      "settings.diagnosticProvider:anthropic",
    );
  });

  it("keeps an unknown future check visible", () => {
    expect(diagnosticCheckLabel("future:check", t)).toBe("future:check");
  });
});

describe("desktop diagnostic remedies", () => {
  it("décrit chaque remède du contrat, sans trou silencieux", () => {
    for (const remedy of DOCTOR_REMEDIES) {
      expect(diagnosticRemedy(remedy), remedy).toBeDefined();
    }
  });

  it("ne transforme que les actions prévues en navigation ou volet système", () => {
    expect(targetTabOf("open-shortcuts")).toBe("preferences");
    expect(targetTabOf("open-providers")).toBe("providers");
    expect(targetTabOf("resume-shortcuts")).toBeNull();
    expect(permissionPaneOf("open-accessibility-settings")).toBe("accessibility");
    expect(permissionPaneOf("open-automation-settings")).toBe("automation");
    expect(permissionPaneOf("request-permissions")).toBeNull();
  });
});

describe("desktop diagnostic summary", () => {
  const base = {
    hasReport: true,
    running: false,
    failed: false,
    copyStatus: "idle" as const,
    failing: 0,
  };

  it("donne la priorité à l'échec d'exécution sur un ancien rapport", () => {
    const state = { ...base, failed: true };
    expect(diagnosticTone(state)).toBe("error");
    expect(diagnosticMessage(state, t)).toBe("settings.diagnosticFailed");
  });

  it("distingue une installation saine d'une liste à corriger", () => {
    expect(diagnosticTone(base)).toBe("success");
    expect(diagnosticTone({ ...base, failing: 2 })).toBe("warning");
  });
});
