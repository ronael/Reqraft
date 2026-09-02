import { describe, expect, it } from "vitest";
import { diagnosticCheckLabel } from "@/apps/desktop/renderer/settings/DiagnosticTab.js";
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
