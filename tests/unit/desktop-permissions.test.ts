import { describe, expect, it } from "vitest";
import {
  isWayland,
  probePermissions,
  type PermissionsProbe,
} from "../../src/desktop/main/permissions.js";

function createProbe(overrides: Partial<PermissionsProbe>): PermissionsProbe {
  return {
    platform: "darwin",
    env: {},
    isTrustedAccessibilityClient: () => false,
    hasAutomation: () => Promise.resolve(false),
    ...overrides,
  };
}

describe("probePermissions (DESKTOP.md §5.9)", () => {
  it("macOS : les deux permissions accordées → cycle complet possible", async () => {
    const report = await probePermissions(
      createProbe({
        isTrustedAccessibilityClient: () => true,
        hasAutomation: () => Promise.resolve(true),
      }),
    );

    expect(report.canReplace).toBe(true);
    expect(report.gap).toBe("none");
  });

  it("macOS : Accessibilité seule → le message nomme l'Automatisation", async () => {
    const report = await probePermissions(
      createProbe({
        isTrustedAccessibilityClient: () => true,
        hasAutomation: () => Promise.resolve(false),
      }),
    );

    expect(report.accessibility).toBe(true);
    expect(report.canReplace).toBe(false);
    expect(report.gap).toBe("automation");
    expect(report.message).toContain("Automatisation");
  });

  it("macOS : Automatisation seule → le message nomme l'Accessibilité", async () => {
    const report = await probePermissions(
      createProbe({
        isTrustedAccessibilityClient: () => false,
        hasAutomation: () => Promise.resolve(true),
      }),
    );

    expect(report.gap).toBe("accessibility");
    expect(report.message).toContain("Accessibilité");
  });

  it("macOS : aucune permission → mode dégradé explicite, jamais bloquant", async () => {
    const report = await probePermissions(createProbe({}));

    expect(report.canReplace).toBe(false);
    expect(report.gap).toBe("both");
    expect(report.message.length).toBeGreaterThan(0);
  });

  it("Wayland : mode plancher annoncé, pas un bug à contourner (§5.4)", async () => {
    const report = await probePermissions(
      createProbe({
        platform: "linux",
        env: { XDG_SESSION_TYPE: "wayland" },
        isTrustedAccessibilityClient: () => true,
        hasAutomation: () => Promise.resolve(true),
      }),
    );

    expect(report.canReplace).toBe(false);
    expect(report.gap).toBe("wayland");
    expect(report.message).toContain("Wayland");
  });

  it("X11 et Windows : aucune permission à demander", async () => {
    for (const [platform, env] of [
      ["linux", { XDG_SESSION_TYPE: "x11" }],
      ["win32", {}],
    ] as const) {
      const report = await probePermissions(createProbe({ platform, env }));
      expect(report.canReplace).toBe(true);
      expect(report.gap).toBe("none");
    }
  });
});

describe("isWayland", () => {
  it("ne se déclenche que sous Linux avec XDG_SESSION_TYPE=wayland", () => {
    expect(isWayland({ XDG_SESSION_TYPE: "wayland" }, "linux")).toBe(true);
    expect(isWayland({ XDG_SESSION_TYPE: "wayland" }, "darwin")).toBe(false);
    expect(isWayland({ XDG_SESSION_TYPE: "x11" }, "linux")).toBe(false);
    expect(isWayland({}, "linux")).toBe(false);
  });
});
